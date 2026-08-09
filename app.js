/**
 * HaulIntel — static site
 * Live briefings/chat via Cloudflare Worker (XAI_API_KEY stays server-side).
 * Falls back to local mock data if the API is offline or unset.
 */
(function () {
  'use strict';
const WORKER_URL = "https://haulintel-api.truckinflorida.workers.dev";
  // ---------------------------------------------------------------------------
  // API config — Worker URL only (NEVER put XAI_API_KEY in this file)
  // After you deploy the Worker, set the URL below OR in localStorage key
  // "haulintel_api" OR ?api=https://your-worker.workers.dev
  // ---------------------------------------------------------------------------
  // Live Grok proxy (Cloudflare). Never put XAI_API_KEY in this file.
 
  const DEFAULT_API_BASE = WORKER_URL;
  let API_BASE = resolveApiBase();
  let lastResearchedCompany = '';
  let chatHistory = [];
  let liveApiOk = null; // null unknown, true/false after probe

  function resolveApiBase() {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromQuery = params.get('api');
      if (fromQuery) {
        localStorage.setItem('haulintel_api', fromQuery.replace(/\/$/, ''));
        return fromQuery.replace(/\/$/, '');
      }
      const stored = localStorage.getItem('haulintel_api');
      if (stored) return stored.replace(/\/$/, '');
    } catch (_) {
      /* ignore */
    }
    if (typeof window.HAULINTEL_API === 'string' && window.HAULINTEL_API) {
      return window.HAULINTEL_API.replace(/\/$/, '');
    }
    // Prefer WORKER_URL for live Grok proxy
    if (WORKER_URL) return WORKER_URL.replace(/\/$/, '');
    return (DEFAULT_API_BASE || '').replace(/\/$/, '');
  }

  function isLiveConfigured() {
    return Boolean(API_BASE || WORKER_URL);
  }

  // ---------------------------------------------------------------------------
  // Mock company database (high-quality, realistic demo content)
  // ---------------------------------------------------------------------------
  const COMPANIES = [
    {
      id: 'horizon',
      names: ['horizon freight lines', 'horizon freight', 'horizon', 'hfl'],
      displayName: 'Horizon Freight Lines',
      dba: 'Horizon Freight',
      mc: 'MC-842901',
      dot: 'DOT-2844102',
      hq: 'Des Moines, IA',
      type: 'Dry van · OTR company driver',
      score: 86,
      scoreLabel: 'Strong',
      scoreClass: 'good',
      vibe: 'One of the better mid-size van fleets you can land without a recruiter fairy tale. They generally pay what they advertise, trucks are newer than average, and home time is real if you run their dedicated/regional lanes. Not perfect — dispatch can get short-staffed on Fridays — but drivers stick around longer than industry norm.',
      recommendation:
        'Worth an application if you want OTR/regional dry van with honest CPM and weekly home options. Ask specifically for the dedicated grocery account if you need predictability.',
      sections: {
        pay: {
          title: 'Pay & home time',
          rating: 'good',
          ratingLabel: 'Solid',
          body: 'Company drivers see roughly $0.62–$0.72 CPM depending on experience and account, with a clear mileage scale after 90 days. Detention after 2 hours is paid ($18–$25/hr depending on customer). Average weekly take-home for solo OTR is in the $1,350–$1,600 range before taxes if you’re turning 2,800–3,200 miles. Sign-on bonuses are modest ($2k–$4k) and not the whole sales pitch.\n\nHome time: dedicated/regional accounts get home weekly or every 10–12 days by design. Pure OTR can stretch 3 weeks out if you chase miles, but planners will work with you if you book time off 2 weeks ahead. Drivers consistently say “what they promised in orientation is what I got.”',
        },
        equipment: {
          title: 'Equipment & maintenance',
          rating: 'good',
          ratingLabel: 'Above average',
          body: 'Majority of power units are 2022–2025 Freightliner Cascadias and Volvo VNL with APU or dual batteries. Average tractor age fleet-wide is under 3 years. Reefers and dry vans get PM on schedule; breakdowns still happen but roadside response is usually same-day in major corridors.\n\nIn-cab: PeopleNet/Omnitracs ELD, tablets for scanning, decent seats. No brand-new everything on day one for new hires — expect a 1–2 year-old truck first, then upgrade as they free up. Shop techs get decent reviews; parts delays are the usual industry headache, not neglect.',
        },
        dispatch: {
          title: 'Dispatch & management',
          rating: 'avg',
          ratingLabel: 'Mostly fair',
          body: 'Dispatchers are assigned by fleet; most drivers keep the same person. Communication is professional more often than not. Peak season (produce + holiday freight) gets chaotic — expect more “take this or sit” pressure in Oct–Dec. Safety department is firm but not gotcha-oriented.\n\nOrientation is 3–4 days, paid. They run a mentor program for new CDL grads that drivers actually recommend instead of dread. HR responds to payroll issues same week. Not a family-owned 40-truck shop vibe — more “competent mid-size carrier that knows drivers can leave.”',
        },
        safety: {
          title: 'Safety / FMCSA notes',
          rating: 'good',
          ratingLabel: 'Clean profile',
          body: 'Demo snapshot (illustrative): Satisfactory safety rating history, no recent out-of-service spike on the public SAFER-style signals we model here. CSA BASIC scores have sat in the acceptable band; HOS and vehicle maintenance not flashing red. Insurance and cargo claims rate are average for dry van.\n\nThey drug test post-accident and random like everyone else — no weird policy surprises. Speed-limiter policies are standard (~65–68 mph depending on unit). Always verify current FMCSA/SAFER data yourself before signing.',
        },
        sentiment: {
          title: 'Recent driver sentiment',
          rating: 'good',
          ratingLabel: 'Positive lean',
          body: 'Last 6–12 months of public driver chatter (forums, review sites, social): majority say pay hits the check as advertised and equipment is “not a beater fleet.” Common gripes: Friday night dispatch, occasional deadhead after deliveries that “should have been loaded,” and slow upgrade from older Cascadias.\n\nRetention chatter is better than mega-carrier average. Several 2–4 year drivers posting “still here” is a good sign. Recruiter claims on TikTok are less inflated than peers. Net vibe: solid B+ operation if you stay off the worst OTR floaters and get on a named account.',
        },
      },
      tips: [
        'Ask which terminal and which dispatcher group you’ll sit under — quality varies by desk.',
        'Get home-time policy in writing for your specific account, not the generic handbook blurb.',
        'Compare their CPM + detention to two other mid-size vans before you quit a current seat.',
      ],
    },
    {
      id: 'ironroute',
      names: ['iron route logistics', 'iron route', 'ironroute', 'irl'],
      displayName: 'Iron Route Logistics',
      dba: 'Iron Route',
      mc: 'MC-791204',
      dot: 'DOT-2651188',
      hq: 'Joliet, IL',
      type: 'Dry van · Regional / OTR mix',
      score: 62,
      scoreLabel: 'Average',
      scoreClass: 'avg',
      vibe: 'Middle-of-the-road mega-adjacent fleet. You’ll make a living, the trucks mostly run, and home time is “possible” if you advocate for yourself. Nothing is outstanding; nothing is an instant red flag either. A lot depends on which terminal and which planner you get.',
      recommendation:
        'Fine as a bridge job or if you need a seat fast. Don’t expect recruiter numbers to match your first 90 days. Negotiate account placement early.',
      sections: {
        pay: {
          title: 'Pay & home time',
          rating: 'avg',
          ratingLabel: 'Okay, not great',
          body: 'Advertised $0.58–$0.68 CPM for company drivers; real-world average after empty and unpaid “short” loads lands closer to effective mid-$0.50s for many new hires. Performance bonuses exist but require clean CSA and on-time percentages that take a full quarter to unlock. Detention is paid after 3 hours at some shippers, 2 at others — inconsistent.\n\nWeekly gross often $1,100–$1,400 for drivers still learning the system; $1,400–$1,550 once you’re turning consistent miles. Home time is promised weekly for “regional,” but regional sometimes means 500-mile radius with 5-day turns that still strand you Saturday. Book time off early; last-minute requests get denied in peak.',
        },
        equipment: {
          title: 'Equipment & maintenance',
          rating: 'avg',
          ratingLabel: 'Mixed bag',
          body: 'Fleet is a blend of 2019–2024 Internationals and Freightliners. Some terminals have sharp trucks; others are known for high-mileage units with deferred interior wear. APU availability is hit-or-miss — ask before you accept a unit if you idle-ban states.\n\nShop turnaround is average: 1–3 days for non-safety items, faster for lights and brakes. Drivers report “they fix safety stuff, comfort stuff waits.” ELD is Omnitracs. Expect the usual pre-trip surprise defects on older trailers.',
        },
        dispatch: {
          title: 'Dispatch & management',
          rating: 'avg',
          ratingLabel: 'Depends on desk',
          body: 'Classic big-fleet lottery. Good planners exist and will protect your home time; overloaded desks will bounce you across the map. Communication is mostly text/app — phone calls when something is on fire. Safety is policy-heavy; expect ride-alongs and camera coaching if you’re new.\n\nOrientation is 5 days, paid at a daily rate. Payroll is usually on time. Recruiters oversell lane consistency — verify with a current driver at your target terminal if you can.',
        },
        safety: {
          title: 'Safety / FMCSA notes',
          rating: 'avg',
          ratingLabel: 'Watch the BASICs',
          body: 'Demo snapshot: historically Satisfactory, but public-style signals show elevated attention in Vehicle Maintenance and Hours-of-Service in past inspection cycles (illustrative). Not a “do not touch” profile, but not a quiet one either. Crash BASIC has been mid-pack.\n\nThey run dash cams (road-facing + driver-facing on many units). That helps some drivers with false claims and frustrates others. Confirm current SAFER scores before orientation.',
        },
        sentiment: {
          title: 'Recent driver sentiment',
          rating: 'avg',
          ratingLabel: 'Split reviews',
          body: 'Online sentiment is a coin flip: roughly half “pays the bills, trucks okay” and half “dispatcher from hell / CPM bait-and-switch.” Newer 2024–2025 reviews lean slightly more negative on home time than 2022. Lease-to-purchase arm is separate — see Patriot-style caution if someone steers you that way.\n\nGlassdoor/Indeed-style themes: decent benefits after 90 days, mediocre communication, equipment variance by yard. Net: average American trucking job. Manage expectations and get everything in writing.',
        },
      },
      tips: [
        'Call the terminal you’ll be based at, not just the 800 recruiter line.',
        'Ask for average weekly miles for your exact fleet code, last 90 days.',
        'If they push lease-purchase hard on day one, slow down and research the contract.',
      ],
    },
    {
      id: 'redline',
      names: ['redline bulk transport', 'redline bulk', 'redline', 'rbt'],
      displayName: 'Redline Bulk Transport',
      dba: 'Redline Bulk',
      mc: 'MC-655018',
      dot: 'DOT-1988734',
      hq: 'Amarillo, TX',
      type: 'Tanker / bulk · OTR',
      score: 34,
      scoreLabel: 'Avoid',
      scoreClass: 'bad',
      vibe: 'Hard pass for most drivers unless you are truly out of options and need a temporary seat. Pattern of unpaid detention fights, aging equipment, and dispatch that treats “no” as a negotiation opener. Safety culture feels reactive. Drivers churn fast for a reason.',
      recommendation:
        'Do not sign on if you have alternatives. If you already work here, document everything and update your résumé. Verify any settlement or final paycheck before you quit mid-route.',
      sections: {
        pay: {
          title: 'Pay & home time',
          rating: 'bad',
          ratingLabel: 'Problem area',
          body: 'Ads shout $1,800–$2,200/week. Real driver reports cluster around $1,000–$1,300 once you subtract forced downtime, slow reload, and disputed accessorials. Percentage-of-load talk for “experienced” drivers often lacks transparency on what the broker actually paid.\n\nHome time is marketed as “flexible.” In practice, flexibility means you stay out until the load board fills. Requests for scheduled home time are frequently delayed “one more turn.” Detention and layover claims are a recurring fight — many drivers say they stop billing after the third unpaid dispute.',
        },
        equipment: {
          title: 'Equipment & maintenance',
          rating: 'bad',
          ratingLabel: 'Aging / deferred',
          body: 'Power units skew older (many 2016–2020). Tanker trailers get the bulk of maintenance attention; tractors show deferred interior and HVAC issues. Breakdowns mid-route with long wait times for wreckers show up repeatedly in driver posts.\n\nELD compliance has been a sore spot in past chatter — not alleging current illegal activity, but drivers report pressure to “make the appointment” when clocks are tight. That alone is a career-risk signal. Inspect any assigned unit hard before you leave the yard.',
        },
        dispatch: {
          title: 'Dispatch & management',
          rating: 'bad',
          ratingLabel: 'Toxic pattern',
          body: 'Consistent theme: last-minute load changes, hostility when you refuse unsafe or illegal HOS requests, and favoritism on better-paying freight. HR is slow on payroll corrections. Orientation downplays the chemical/hazmat reality for new bulk drivers.\n\nSeveral reviews describe being stranded at shippers with no planner response for hours. That’s not “busy” — that’s broken ops. Leadership communication from the top is sparse; culture is “keep the wheels turning at any cost.”',
        },
        safety: {
          title: 'Safety / FMCSA notes',
          rating: 'bad',
          ratingLabel: 'Elevated risk signals',
          body: 'Demo snapshot (illustrative only): pattern of higher-than-peer intervention thresholds in Unsafe Driving and HOS-style BASICs in recent modeled periods. Multiple public complaint themes around maintenance and pressure. Not a substitute for live FMCSA data — pull SAFER and SMS yourself and walk if numbers are ugly.\n\nTanker work already carries higher stakes. Pair that with weak safety culture and you’re stacking risk on your CDL and livelihood.',
        },
        sentiment: {
          title: 'Recent driver sentiment',
          rating: 'bad',
          ratingLabel: 'Strongly negative',
          body: 'Recent driver sentiment is overwhelmingly negative across forums and review aggregates. Common phrases: “run,” “paycheck lies,” “will not fix trucks,” “dispatcher screamed.” A thin minority of long-tenured bulk specialists say they make it work with one good planner — that’s not a fleet endorsement, that’s survivors.\n\nGlassdoor-type themes: high turnover, low trust, “recruiters disappear after you start.” Net vibe: protect your license and your wallet elsewhere.',
        },
      },
      tips: [
        'Pull live FMCSA SAFER/SMS before you even call them back.',
        'Never accept a load that requires you to break HOS — document any pressure.',
        'If you’re already there, photograph equipment defects and keep personal copies of logs.',
      ],
    },
    {
      id: 'patriot',
      names: [
        'patriot lease express',
        'patriot lease',
        'patriot express',
        'patriot',
        'ple',
      ],
      displayName: 'Patriot Lease Express',
      dba: 'Patriot Lease / PLE',
      mc: 'MC-912447',
      dot: 'DOT-3012289',
      hq: 'Atlanta, GA',
      type: 'Lease-purchase · dry van',
      score: 28,
      scoreLabel: 'Lease trap risk',
      scoreClass: 'warn',
      vibe: 'Classic lease-purchase machine dressed up as “be your own boss.” The truck payment, escrow, insurance, and forced dispatch combine so many drivers never build equity. A few make it work with perfect maintenance luck and max miles — most leave negative and burned. Treat every number in the pitch deck as hostile until proven otherwise.',
      recommendation:
        'Walk unless an independent accountant and a trucking-savvy lawyer review the full lease, insurance, and escrow docs. Prefer true owner-operator with your own authority or a clean company seat instead.',
      sections: {
        pay: {
          title: 'Pay & home time',
          rating: 'bad',
          ratingLabel: 'Gross ≠ yours',
          body: 'Recruiters talk 70–80% of load or “$2.50+/mi gross.” What hits your pocket after truck lease, physical damage, liability package, trailer rental, ELD, occupancy tax, and escrow can look like company-driver money with owner-operator risk.\n\nHome time is “you decide” — until the lease requires minimum weekly revenue to avoid default. That minimum often forces you to stay out. Settlements are dense; line items appear for shop, tires, and “admin.” Ask for a real sample settlement from a driver at week 20, not week 1.',
        },
        equipment: {
          title: 'Equipment & maintenance',
          rating: 'warn',
          ratingLabel: 'You pay either way',
          body: 'Trucks are often high-mileage “program” units sold as low-down lease specials. When something fails out of warranty, the repair comes from your escrow or pocket. Down time still accrues lease payments — the meter doesn’t stop because the turbo died in Topeka.\n\nSome packages include maintenance; read the exclusions (tires, aftertreatment, accident-related). If the contract lets them force shop choice at marked-up rates, price that in before you sign.',
        },
        dispatch: {
          title: 'Dispatch & management',
          rating: 'bad',
          ratingLabel: 'Control without ownership',
          body: '“Owner-operator” branding with company-style forced dispatch is the tell. You may not legally refuse freight without lease consequences. That is not independence — it’s risk transfer.\n\nSupport quality is sales-heavy at start, thin after. When freight softens, lease operators feel it first: lower RPM, same fixed costs. Escrow release at end of contract is a frequent dispute theme in public complaints.',
        },
        safety: {
          title: 'Safety / FMCSA notes',
          rating: 'avg',
          ratingLabel: 'Check authority carefully',
          body: 'Demo snapshot: carrier authority may look fine on paper while the business model still fails drivers economically. CSA can be average while the lease math is predatory. Separate safety research from financial research — pass both tests.\n\nIf they pressure you to run under their authority with insurance you don’t control, understand who is on the hook for claims and CSA points.',
        },
        sentiment: {
          title: 'Recent driver sentiment',
          rating: 'bad',
          ratingLabel: 'Buyer beware chorus',
          body: 'Sentiment around lease-purchase programs like this is heavily cautionary: “got out negative,” “truck never gets paid off,” “escrow disappeared,” “forced cheap freight.” Positive reviews often sound like early-honeymoon or recruiter-adjacent posts.\n\nIndependent trucking educators and veteran O/Os generally advise: buy used with cash/bank financing you understand, or stay company until you can. Net vibe: high financial injury risk.',
        },
      },
      tips: [
        'Demand a blank contract + sample settlement PDF before orientation travel.',
        'Calculate break-even miles/week including empty, fuel, and downtime.',
        'Never put family house equity or retirement into a truck lease you don’t fully understand.',
      ],
    },
    {
      id: 'bluepeak',
      names: [
        'blue peak refrigerated',
        'blue peak reefer',
        'blue peak',
        'bluepeak',
        'bpr',
      ],
      displayName: 'Blue Peak Refrigerated',
      dba: 'Blue Peak Reefer',
      mc: 'MC-778331',
      dot: 'DOT-2510944',
      hq: 'Boise, ID',
      type: 'Reefer · regional West / OTR',
      score: 74,
      scoreLabel: 'Good fit (reefer)',
      scoreClass: 'good',
      vibe: 'Respectable reefer shop for drivers who already understand temperature work. Pay is competitive for the West, equipment is maintained because spoiled loads cost them money, and home time on regional produce/grocery accounts is legitimate. Learning curve is real if you’ve only pulled dry van.',
      recommendation:
        'Strong option for experienced reefer drivers in the Mountain/West. Dry-van-only drivers should budget training time and ask about team vs solo before signing. Good reputation if you want temp-controlled without mega-carrier chaos.',
      sections: {
        pay: {
          title: 'Pay & home time',
          rating: 'good',
          ratingLabel: 'Competitive reefer',
          body: 'Solo company reefer roughly $0.66–$0.78 CPM with experience scale; some grocery dedicated pays hourly or hybrid. Accessorials for multi-stop and lumper handling are clearer than average. Average solid week: $1,450–$1,750 depending on season and whether you’re on produce peaks.\n\nHome time: West regional can be home most weekends if you’re on the right account. Peak produce season (spring–fall) will keep you busier — that’s when the money is. They don’t pretend OTR produce is a 34-home every weekend job. Drivers appreciate the honesty.',
        },
        equipment: {
          title: 'Equipment & maintenance',
          rating: 'good',
          ratingLabel: 'Temp units prioritized',
          body: 'Tractors mostly 2021–2025; reefers are Carrier/Thermo King with remote monitoring. When a reefer unit alarms, shop priority is high — cargo claims hurt. Trailers are cleaner than bulk commodity fleets. Pre-cool discipline is enforced (as it should be).\n\nWinter mountain running means chains and APU matter — fleet generally equips for it. Newer hires may get slightly older tractors paired with solid trailers. That’s acceptable trade-off for most reefer pros.',
        },
        dispatch: {
          title: 'Dispatch & management',
          rating: 'good',
          ratingLabel: 'Knows the freight',
          body: 'Planners understand appointment windows and temp compliance better than dry-van generalists. Communication is direct. They will push you in produce season, but it’s usually about real freight, not invented urgency.\n\nSafety training on temp control and securement is stronger than average. Orientation covers shipper expectations for big grocery DCs. Not a soft culture — reefer mistakes cost money — but fair if you do the job.',
        },
        safety: {
          title: 'Safety / FMCSA notes',
          rating: 'good',
          ratingLabel: 'Stable',
          body: 'Demo snapshot: Satisfactory history, no alarming modeled spikes in crash or HOS BASICs. Vehicle maintenance scores stay healthier than bulk/tanker peers because reefers force upkeep. Still verify live FMCSA data.\n\nMountain weather and winter chains are operational risks they train for. Drug/alcohol policy is standard DOT.',
        },
        sentiment: {
          title: 'Recent driver sentiment',
          rating: 'good',
          ratingLabel: 'Quietly respected',
          body: 'Reefer community chatter rates Blue Peak as “legit regional” more often than viral drama. Complaints center on produce-season hustle and occasional multi-stop fatigue — not unpaid miles or unsafe iron. Retention among 1–3 year reefer drivers is better than mega reefers.\n\nDry van transplants sometimes bounce if they underestimated temp work. Net vibe: good carrier if reefer is your trade; not a free money machine.',
        },
      },
      tips: [
        'Confirm whether your account is produce peak OTR or grocery regional before you accept.',
        'Ask about lumper reimbursement timing — weekly vs settlement.',
        'If new to reefer, request a ride-along or mentor week; temp claims end careers and cargo.',
      ],
    },
  ];

  // ---------------------------------------------------------------------------
  // Chat: suggested questions + keyword-based demo answers
  // ---------------------------------------------------------------------------
  const CHAT_SUGGESTIONS = [
    'Is Horizon Freight actually worth applying to?',
    'How do I spot a lease-purchase trap?',
    'What should I ask a recruiter on the phone?',
    'Redline Bulk — red flags?',
    'Company driver vs lease-purchase?',
  ];

  const CHAT_RESPONSES = [
    {
      keys: ['horizon', 'hfl', 'worth applying', 'horizon freight'],
      answer:
        'Yeah — of the sample carriers in this demo, Horizon Freight Lines is one of the cleaner company-driver plays. Pay tends to land near what they advertise, iron is newer than average, and home time is real on dedicated/regional, not just a brochure line.\n\nThat said, still do the basics: ask which dispatcher desk you’ll sit under, get home-time rules for that account in writing, and compare their CPM + detention to two other mid-size vans. No carrier is perfect — Friday dispatch can get sloppy — but Horizon’s the kind of place drivers stay longer than a mega-carrier revolving door.\n\nSearch “Horizon Freight Lines” in Research for the full briefing.',
    },
    {
      keys: ['lease', 'lease-purchase', 'lease purchase', 'patriot', 'own boss', 'escrow'],
      answer:
        'Lease-purchase traps usually share the same skeleton:\n\n1) Big gross numbers, tiny net after truck payment, insurance, trailer, escrow, and “admin.”\n2) Forced dispatch while they call you an owner-operator.\n3) Payments keep running when the truck is in the shop.\n4) Escrow and end-of-lease buyout math that never quite works in your favor.\n5) Pressure to sign before you’ve shown the contract to someone smart.\n\nIn this demo, Patriot Lease Express is the textbook example. A few people make these programs work. Most don’t. If you’re set on O/O, price true ownership (bank note or cash truck + your authority) against a clean company seat. Don’t gamble the house on a “$0 down” pitch.\n\nRule of thumb: if they won’t email a full sample settlement and blank lease before you fly to orientation, you’re the product.',
    },
    {
      keys: ['recruiter', 'phone', 'what should i ask', 'questions to ask', 'interview'],
      answer:
        'Skip the lifestyle talk. Hit numbers and policies:\n\n• Average weekly miles for my exact fleet/terminal last 90 days?\n• CPM or % after empty, and when do raises hit?\n• Detention: after how many hours, at what rate, paid how fast?\n• Home time for THIS account — in writing, not “we try.”\n• Who is my dispatcher? Can I talk to a current driver on that desk?\n• Truck year/make I’ll actually get week one?\n• Any forced dispatch, cameras, speed limiters, pet/passenger policy?\n• Exact orientation pay and who covers travel if I walk away?\n\nWrite answers down. If they dodge or only talk sign-on bonus, that’s your signal. Recruiter job is to fill seats. Your job is to protect your CDL and your weeks at home.',
    },
    {
      keys: ['redline', 'red flag', 'redline bulk', 'avoid', 'worst'],
      answer:
        'In the demo data, Redline Bulk Transport is the “hard pass” profile: pay ads that don’t match settlements, aging iron, dispatch drama, and safety-culture concerns. Tanker/bulk already raises the stakes — stack that on a toxic ops pattern and you’re risking more than a bad paycheck.\n\nRed flags in general (any carrier):\n• Recruiter numbers nobody on the yard confirms\n• “We’ll fix that truck next week” for months\n• Pressure to bend HOS or log “personal conveyance” funny\n• Detention never pays without a fight\n• Sky-high turnover and “don’t talk to other drivers” vibes\n\nPull live FMCSA SAFER/SMS yourself, talk to someone who left in the last 6 months, and keep walking if your gut says no. There’s always another seat.',
    },
    {
      keys: ['company driver', 'company vs', 'vs lease', 'o/o', 'owner operator', 'owner-operator'],
      answer:
        'Company driver: simpler. They own the truck, insurance, and most breakdown risk. You trade upside for a steadier (usually lower ceiling) paycheck and less paperwork. Best path for most people until you’ve saved a real buffer and learned freight.\n\nLease-purchase: looks like ownership, often behaves like a job with all the risk. You’re on the hook for payments, shops, and soft freight. Only makes sense with iron you trust, freight you control, and math that still works on a bad month.\n\nTrue owner-operator (your truck, your authority or solid lease-on): maximum freedom and maximum admin — IFTA, IRP, insurance, sales, breakdowns. Don’t rush it.\n\nHaulIntel’s take for most CDL holders right now: nail a fair company seat first (see Horizon or Blue Peak style ops in the demo). Build cash and skills. Then decide if ownership is a business plan or a mood.',
    },
    {
      keys: ['iron route', 'ironroute', 'average', 'okay company'],
      answer:
        'Iron Route Logistics is the “middle of the pack” demo carrier. You’ll probably make a living, trucks are mixed by terminal, and home time depends hard on which planner you draw. Not a horror show, not a destination fleet.\n\nUse it as a bridge if you need work, but verify miles and home time with the actual terminal — not the 800 line. Watch for a hard sell into their lease arm; that’s a different animal.\n\nFull write-up is under Research → Iron Route Logistics.',
    },
    {
      keys: ['blue peak', 'bluepeak', 'reefer', 'refrigerated', 'temp'],
      answer:
        'Blue Peak Refrigerated is the solid reefer option in this demo — competitive West/regional pay, maintenance that takes temp units seriously, and home time that matches what they say on grocery/regional accounts. Produce season will work you; that’s also when the money shows up.\n\nIf you’ve only pulled dry van, respect the learning curve: pulp temps, continuous run, multi-stops, lumper chaos. Ask about mentor time. Reefer mistakes cost cargo and careers.\n\nSearch Blue Peak in Research for the section-by-section briefing.',
    },
    {
      keys: ['home time', 'home weekly', 'get home', 'time off'],
      answer:
        '“Home weekly” is the most abused phrase in trucking. Always pin it down:\n\n• Home which nights? How many consecutive days?\n• Forced resets on the road or at the house?\n• How far in advance do I book? Who approves?\n• What happens in peak season — still honored?\n\nDedicated/regional accounts beat pure OTR floaters for real home time. Get the account name, not just the company name. And remember: a lower CPM with honest weekly home often beats a flashy CPM that keeps you gone 21 days.',
    },
    {
      keys: ['pay', 'cpm', 'cents per mile', 'detention', 'salary', 'money'],
      answer:
        'Ignore the billboard CPM for a minute. Ask for:\n\n• Average paid miles/week for your fleet last quarter\n• Empty ratio\n• Detention rules (start time, rate, documentation)\n• Stop-off, layover, breakdown pay\n• How often payroll actually hits as explained\n\nEffective pay = (paid miles × CPM + accessorials − unpaid sits) / total hours you’re away from home. A “lower” CPM with detention that pays and honest miles can beat a “high” CPM with constant unpaid dwell.\n\nIn our demo set: Horizon and Blue Peak skew honest; Iron Route is meh; Redline and Patriot are where the ads and the check diverge hard.',
    },
    {
      keys: ['fmcsa', 'safer', 'csa', 'safety score', 'dot number'],
      answer:
        'Before you sign anything:\n\n1) Look up the carrier on FMCSA SAFER by DOT or MC.\n2) Check SMS/CSA BASIC percentiles if available — HOS, vehicle maintenance, unsafe driving, crash.\n3) Scan inspection and crash history trends, not one bad month.\n4) Confirm authority is active and insurance is on file.\n\nHaulIntel’s demo includes illustrative safety notes only. Live Grok research will dig public signals for you later — until then, SAFER is free and you should use it every time. A clean personality on the phone doesn’t override a red CSA board.',
    },
    {
      keys: ['demo', 'real', 'coming soon', 'grok', 'live', 'api'],
      answer:
        'You’re on the HaulIntel static demo right now — sample carriers and scripted chat so you can feel the product. Live Grok-powered research (real briefings on real companies) is the next step, likely behind a small Cloudflare Worker or similar so the API key never sits in the browser.\n\nUntil then: use the Research chips, poke the chat with real driver questions, and treat every number here as educational fiction. When live mode ships, same UI — better truth underneath.',
    },
  ];

  const DEFAULT_CHAT_ANSWER =
    'Good question. In this demo I only have deep briefings on five sample carriers: Horizon Freight Lines (strong company van), Iron Route Logistics (average), Redline Bulk Transport (avoid), Patriot Lease Express (lease-purchase caution), and Blue Peak Refrigerated (solid reefer).\n\nTry asking about one of those by name, or about lease traps, recruiter questions, home time, CPM/detention, or FMCSA checks. Live Grok answers for any carrier are coming — for now I’m running on sample knowledge with a veteran-driver voice.\n\nTip: open Research, tap a company chip, then come back here and ask a follow-up.';

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function normalize(str) {
    return (str || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ');
  }

  function findCompany(query) {
    const q = normalize(query);
    if (!q) return null;

    // Exact name match first
    for (const c of COMPANIES) {
      if (c.names.some((n) => n === q)) return c;
      if (normalize(c.displayName) === q) return c;
    }

    // Substring / partial
    for (const c of COMPANIES) {
      if (c.names.some((n) => q.includes(n) || n.includes(q))) return c;
      if (normalize(c.displayName).includes(q) || q.includes(normalize(c.displayName))) {
        return c;
      }
    }

    // Token overlap (e.g. "horizon lines")
    const tokens = q.split(' ').filter((t) => t.length > 2);
    if (tokens.length) {
      let best = null;
      let bestScore = 0;
      for (const c of COMPANIES) {
        const hay = c.names.join(' ') + ' ' + normalize(c.displayName);
        let score = 0;
        for (const t of tokens) {
          if (hay.includes(t)) score += 1;
        }
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
      if (bestScore >= 1 && best) return best;
    }

    return null;
  }

  function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  function textToHtml(text) {
    return escapeHtml(text).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
  }

  function badgeClass(rating) {
    if (rating === 'good') return 'badge-good';
    if (rating === 'bad') return 'badge-bad';
    if (rating === 'warn') return 'badge-warn';
    return 'badge-avg';
  }

  function scoreColor(score) {
    if (score >= 70) return '#22c55e';
    if (score >= 50) return '#eab308';
    if (score >= 35) return '#f97316';
    return '#ef4444';
  }

  function scrollToId(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------------------------------------------------------------------------
  // Research UI
  // ---------------------------------------------------------------------------
  const researchResult = document.getElementById('research-result');
  const researchEmpty = document.getElementById('research-empty');
  const researchNotFound = document.getElementById('research-notfound');
  const researchLoading = document.getElementById('research-loading');
  const researchSearch = document.getElementById('research-search');
  const heroSearch = document.getElementById('hero-search');

  function setResearchState(state) {
    researchEmpty.classList.add('hidden');
    researchNotFound.classList.add('hidden');
    researchLoading.classList.add('hidden');
    researchResult.classList.add('hidden');

    if (state === 'empty') researchEmpty.classList.remove('hidden');
    if (state === 'notfound') researchNotFound.classList.remove('hidden');
    if (state === 'loading') researchLoading.classList.remove('hidden');
    if (state === 'result') researchResult.classList.remove('hidden');
  }

  function renderScoreRing(score) {
    const r = 36;
    const c = 2 * Math.PI * r;
    const offset = c - (score / 100) * c;
    const color = scoreColor(score);
    return `
      <svg width="88" height="88" viewBox="0 0 88 88" class="shrink-0" aria-hidden="true">
        <circle cx="44" cy="44" r="${r}" fill="none" stroke="#1a2744" stroke-width="8"/>
        <circle class="score-ring" cx="44" cy="44" r="${r}" fill="none" stroke="${color}" stroke-width="8"
          stroke-dasharray="${c}" stroke-dashoffset="${offset}"/>
        <text x="44" y="48" text-anchor="middle" fill="white" font-size="20" font-weight="700">${score}</text>
      </svg>
    `;
  }

  function renderBriefing(company) {
    const sections = Object.values(company.sections)
      .map(
        (s) => `
      <div class="rounded-xl bg-ink-800/50 border border-white/5 p-4 sm:p-5">
        <div class="flex flex-wrap items-center gap-2 mb-3">
          <h4 class="font-semibold text-white text-base">${escapeHtml(s.title)}</h4>
          <span class="text-xs font-medium px-2 py-0.5 rounded-full ${badgeClass(s.rating)}">${escapeHtml(s.ratingLabel)}</span>
        </div>
        <div class="text-sm text-steel-300 leading-relaxed space-y-3"><p>${textToHtml(s.body)}</p></div>
      </div>
    `
      )
      .join('');

    const tips = company.tips
      .map(
        (t) => `
      <li class="flex gap-2 text-sm text-steel-300">
        <span class="text-amber-glow shrink-0 mt-0.5">▸</span>
        <span>${escapeHtml(t)}</span>
      </li>
    `
      )
      .join('');

    const isLive = Boolean(company.live);
    const idNote = isLive ? '' : ' <span class="text-steel-600">(demo IDs)</span>';
    const sourceBadge = isLive
      ? '<span class="text-xs font-medium px-2 py-0.5 rounded-full badge-good">Live · Grok</span>'
      : '<span class="text-xs font-medium px-2 py-0.5 rounded-full badge-avg">Demo sample</span>';
    const footerNote = isLive
      ? escapeHtml(
          company.disclaimer ||
            'AI-assisted briefing. Not legal or employment advice. Verify pay, contracts, and FMCSA/SAFER data independently.'
        )
      : 'Demo briefing for illustration only. Not legal or employment advice. Verify pay, contracts, and FMCSA/SAFER data independently.';

    researchResult.innerHTML = `
      <div class="rounded-2xl border border-white/10 bg-ink-900 shadow-card overflow-hidden">
        <!-- Header -->
        <div class="p-5 sm:p-6 border-b border-white/5 bg-gradient-to-br from-ink-800/80 to-ink-900">
          <div class="flex flex-col sm:flex-row sm:items-start gap-5">
            <div class="flex items-start gap-4 flex-1 min-w-0">
              ${renderScoreRing(company.score)}
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2 mb-1">
                  <h3 class="text-xl sm:text-2xl font-bold text-white tracking-tight">${escapeHtml(company.displayName)}</h3>
                  <span class="text-xs font-medium px-2 py-0.5 rounded-full ${badgeClass(company.scoreClass)}">${escapeHtml(company.scoreLabel)}</span>
                  ${sourceBadge}
                </div>
                <p class="text-sm text-steel-400 mb-2">${escapeHtml(company.type)} · ${escapeHtml(company.hq)}</p>
                <p class="text-xs text-steel-500 font-mono">${escapeHtml(company.mc)} · ${escapeHtml(company.dot)}${idNote}</p>
              </div>
            </div>
          </div>
          <div class="mt-5 p-4 rounded-xl bg-ink-950/50 border border-white/5">
            <p class="text-xs font-semibold uppercase tracking-wider text-amber-soft/80 mb-2">Overall vibe</p>
            <p class="text-sm sm:text-base text-steel-200 leading-relaxed">${escapeHtml(company.vibe)}</p>
          </div>
          <div class="mt-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/15">
            <p class="text-xs font-semibold uppercase tracking-wider text-amber-soft/80 mb-2">Recommendation</p>
            <p class="text-sm text-steel-200 leading-relaxed">${escapeHtml(company.recommendation)}</p>
          </div>
        </div>

        <!-- Sections -->
        <div class="p-4 sm:p-6 grid gap-4">
          ${sections}
        </div>

        <!-- Tips -->
        <div class="px-4 sm:px-6 pb-6">
          <div class="rounded-xl border border-white/5 bg-ink-800/30 p-4 sm:p-5">
            <h4 class="font-semibold text-white mb-3 text-sm">Before you sign</h4>
            <ul class="space-y-2">${tips}</ul>
          </div>
          <p class="mt-4 text-xs text-steel-500 leading-relaxed">
            ${footerNote}
          </p>
          <div class="mt-4 flex flex-wrap gap-2">
            <a href="#chat" class="inline-flex items-center gap-1.5 text-sm font-medium text-amber-soft hover:text-amber-400 transition-colors">
              Ask a follow-up about ${escapeHtml(company.displayName.split(' ')[0])} →
            </a>
          </div>
        </div>
      </div>
    `;

    setResearchState('result');
    researchResult.classList.add('fade-in');
  }

  let searchTimer = null;

  async function fetchLiveResearch(companyName) {
    if (!isLiveConfigured()) return null;
    const res = await fetch(WORKER_URL + '/api/research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: companyName }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || data.detail || 'Research request failed');
    }
    if (!data.briefing) throw new Error('No briefing in response');
    liveApiOk = true;
    return data.briefing;
  }

  async function fetchLiveChat(message, companyHint) {
    if (!isLiveConfigured()) return null;
    const res = await fetch(WORKER_URL + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        company: companyHint || lastResearchedCompany || '',
        history: chatHistory.slice(-8),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || data.detail || 'Chat request failed');
    }
    liveApiOk = true;
    return data.answer;
  }

  function runMockSearch(query) {
    return new Promise((resolve) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        resolve(findCompany(query));
      }, 650 + Math.random() * 400);
    });
  }

  async function runSearch(rawQuery, { scroll = true } = {}) {
    const query = (rawQuery || '').trim();
    if (!query) {
      setResearchState('empty');
      return;
    }

    if (researchSearch) researchSearch.value = query;
    if (heroSearch) heroSearch.value = query;

    setResearchState('loading');
    if (scroll) scrollToId('research');
    lastResearchedCompany = query;

    // Prefer live Grok via Worker when configured
    if (isLiveConfigured()) {
      try {
        const briefing = await fetchLiveResearch(query);
        if (briefing) {
          renderBriefing(briefing);
          updateLiveChrome(true);
          return;
        }
      } catch (err) {
        console.warn('Live research failed, trying mock:', err);
        liveApiOk = false;
        // Fall through to mock
      }
    }

    const company = await runMockSearch(query);
    if (!company) {
      if (isLiveConfigured()) {
        researchNotFound.innerHTML = `
          <h3 class="text-lg font-semibold text-white mb-2">Could not complete briefing</h3>
          <p class="text-sm text-steel-400 mb-4">Live API did not return a result and this name is not in the demo set. Check that the Worker is deployed and <code class="text-amber-soft">XAI_API_KEY</code> is set. You can still try a sample chip below.</p>
        `;
      }
      setResearchState('notfound');
      return;
    }
    renderBriefing(company);
  }

  // Forms
  document.getElementById('hero-search-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    runSearch(heroSearch.value, { scroll: true });
  });

  document.getElementById('research-search-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    runSearch(researchSearch.value, { scroll: true });
  });

  // Example links under hero
  document.querySelectorAll('.example-company').forEach((btn) => {
    btn.addEventListener('click', () => {
      runSearch(btn.getAttribute('data-name'), { scroll: true });
    });
  });

  // Chips + datalist
  function initCompanyPickers() {
    const chips = document.getElementById('company-chips');
    const datalist = document.getElementById('company-suggestions');
    if (!chips) return;

    const chipMeta = {
      horizon: { label: 'Horizon Freight', tone: 'good' },
      ironroute: { label: 'Iron Route', tone: 'avg' },
      redline: { label: 'Redline Bulk', tone: 'bad' },
      patriot: { label: 'Patriot Lease', tone: 'warn' },
      bluepeak: { label: 'Blue Peak Reefer', tone: 'good' },
    };

    chips.innerHTML = COMPANIES.map((c) => {
      const meta = chipMeta[c.id] || { label: c.displayName, tone: 'avg' };
      return `
        <button type="button" class="company-chip inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium border transition-colors
          bg-ink-800 hover:bg-ink-700 text-steel-200 border-white/10 hover:border-white/20 focus-ring"
          data-name="${escapeHtml(c.displayName)}">
          <span class="w-1.5 h-1.5 rounded-full ${
            meta.tone === 'good'
              ? 'bg-good'
              : meta.tone === 'bad'
                ? 'bg-bad'
                : meta.tone === 'warn'
                  ? 'bg-orange-400'
                  : 'bg-warn'
          }"></span>
          ${escapeHtml(meta.label)}
        </button>
      `;
    }).join('');

    chips.querySelectorAll('.company-chip').forEach((btn) => {
      btn.addEventListener('click', () => runSearch(btn.getAttribute('data-name'), { scroll: true }));
    });

    if (datalist) {
      datalist.innerHTML = COMPANIES.map(
        (c) => `<option value="${escapeHtml(c.displayName)}"></option>`
      ).join('');
    }
  }

  // ---------------------------------------------------------------------------
  // Chat UI
  // ---------------------------------------------------------------------------
  const chatMessages = document.getElementById('chat-messages');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const chatSuggestions = document.getElementById('chat-suggestions');

  function appendMessage(role, text, { animate = true } = {}) {
    if (!chatMessages) return;

    const wrap = document.createElement('div');
    wrap.className = `flex ${role === 'user' ? 'justify-end' : 'justify-start'} ${animate ? 'fade-in' : ''}`;

    const bubble = document.createElement('div');
    bubble.className = `max-w-[90%] sm:max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
      role === 'user' ? 'chat-user text-steel-100 rounded-br-md' : 'chat-bot text-steel-200 rounded-bl-md'
    }`;

    if (role === 'bot') {
      bubble.innerHTML = `<p class="text-[10px] uppercase tracking-wider text-steel-500 font-semibold mb-1.5">HaulIntel</p><div class="space-y-2"><p>${textToHtml(text)}</p></div>`;
    } else {
      bubble.innerHTML = `<p>${escapeHtml(text)}</p>`;
    }

    wrap.appendChild(bubble);
    chatMessages.appendChild(wrap);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function showTyping() {
    const wrap = document.createElement('div');
    wrap.id = 'chat-typing';
    wrap.className = 'flex justify-start fade-in';
    wrap.innerHTML = `
      <div class="chat-bot rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
        <span class="w-1.5 h-1.5 rounded-full bg-steel-400 pulse-bar"></span>
        <span class="w-1.5 h-1.5 rounded-full bg-steel-400 pulse-bar" style="animation-delay:0.15s"></span>
        <span class="w-1.5 h-1.5 rounded-full bg-steel-400 pulse-bar" style="animation-delay:0.3s"></span>
      </div>
    `;
    chatMessages.appendChild(wrap);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function hideTyping() {
    document.getElementById('chat-typing')?.remove();
  }

  function matchChatAnswer(question) {
    const q = normalize(question);
    let best = null;
    let bestHits = 0;

    for (const entry of CHAT_RESPONSES) {
      let hits = 0;
      for (const key of entry.keys) {
        if (q.includes(normalize(key))) hits += 1;
      }
      if (hits > bestHits) {
        bestHits = hits;
        best = entry;
      }
    }

    return bestHits > 0 ? best.answer : DEFAULT_CHAT_ANSWER;
  }

  async function sendChat(question) {
    const q = (question || '').trim();
    if (!q) return;

    appendMessage('user', q);
    chatHistory.push({ role: 'user', content: q });
    if (chatInput) chatInput.value = '';

    // Hide suggestions after first real exchange beyond welcome
    if (chatSuggestions && chatMessages.children.length > 2) {
      chatSuggestions.classList.add('hidden');
    }

    showTyping();

    if (isLiveConfigured()) {
      try {
        const answer = await fetchLiveChat(q, lastResearchedCompany);
        hideTyping();
        if (answer) {
          appendMessage('bot', answer);
          chatHistory.push({ role: 'assistant', content: answer });
          updateLiveChrome(true);
          return;
        }
      } catch (err) {
        console.warn('Live chat failed, using mock:', err);
        liveApiOk = false;
      }
    }

    const delay = 500 + Math.random() * 400;
    await new Promise((r) => setTimeout(r, delay));
    hideTyping();
    const mock = matchChatAnswer(q);
    appendMessage('bot', mock);
    chatHistory.push({ role: 'assistant', content: mock });
  }

  function initChat() {
    if (!chatMessages) return;

    const welcome = isLiveConfigured()
      ? 'Hey — I’m HaulIntel. Live Grok is connected through the secure API proxy. Ask about any carrier, lease traps, recruiter questions, home time, or pay. If the API hiccups, I’ll fall back to sample answers.'
      : 'Hey — I’m the HaulIntel demo assistant. Ask me about the sample carriers, lease-purchase red flags, what to ask a recruiter, home time, or pay. Live Grok turns on after the Cloudflare Worker is deployed and linked (see README).';

    appendMessage('bot', welcome, { animate: false });

    if (chatSuggestions) {
      chatSuggestions.innerHTML = CHAT_SUGGESTIONS.map(
        (q) => `
        <button type="button" class="chat-suggest text-left text-xs sm:text-sm px-3 py-1.5 rounded-full bg-ink-800 border border-white/10 text-steel-300 hover:border-amber-500/40 hover:text-amber-soft transition-colors focus-ring">
          ${escapeHtml(q)}
        </button>
      `
      ).join('');

      chatSuggestions.querySelectorAll('.chat-suggest').forEach((btn) => {
        btn.addEventListener('click', () => sendChat(btn.textContent.trim()));
      });
    }

    chatForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      sendChat(chatInput?.value);
    });
  }

  // ---------------------------------------------------------------------------
  // Nav / chrome
  // ---------------------------------------------------------------------------
  function initNav() {
    const drawer = document.getElementById('nav-drawer');
    const menuBtn = document.getElementById('menu-btn');
    const menuClose = document.getElementById('menu-close');
    const overlay = document.getElementById('nav-overlay');

    function openMenu() {
      drawer?.classList.remove('closed');
      menuBtn?.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    }

    function closeMenu() {
      drawer?.classList.add('closed');
      menuBtn?.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }

    menuBtn?.addEventListener('click', openMenu);
    menuClose?.addEventListener('click', closeMenu);
    overlay?.addEventListener('click', closeMenu);

    document.querySelectorAll('.mobile-nav-link').forEach((link) => {
      link.addEventListener('click', closeMenu);
    });

    // Active section highlight (simple)
    const links = document.querySelectorAll('.nav-link');
    const sections = ['home', 'research', 'chat', 'about']
      .map((id) => document.getElementById(id))
      .filter(Boolean);

    if ('IntersectionObserver' in window && links.length) {
      const obs = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const id = entry.target.id;
            links.forEach((a) => {
              const active = a.getAttribute('href') === '#' + id;
              a.classList.toggle('text-white', active);
              a.classList.toggle('bg-white/5', active);
              a.classList.toggle('text-steel-400', !active);
            });
          });
        },
        { rootMargin: '-30% 0px -55% 0px', threshold: 0 }
      );
      sections.forEach((s) => obs.observe(s));
    }
  }

  function updateLiveChrome(isLive) {
    const banner = document.getElementById('demo-banner');
    if (!banner) return;
    if (isLive && isLiveConfigured()) {
      banner.classList.remove('bg-amber-500/10', 'border-amber-500/25', 'text-amber-100/90');
      banner.classList.add('bg-emerald-500/10', 'border-emerald-500/25', 'text-emerald-100/90');
      banner.innerHTML =
        '<span class="font-medium text-emerald-300">Live mode</span>' +
        '<span class="hidden sm:inline"> — Grok-powered research via secure API proxy. Not legal advice.</span>' +
        '<span class="sm:hidden"> — Grok connected.</span>' +
        '<button type="button" id="dismiss-banner" class="ml-2 text-emerald-200/70 hover:text-emerald-100 underline text-xs" aria-label="Dismiss">Dismiss</button>';
      document.getElementById('dismiss-banner')?.addEventListener('click', () => {
        banner.classList.add('hidden');
      });
    }
  }

  function initBanner() {
    const banner = document.getElementById('demo-banner');
    const btn = document.getElementById('dismiss-banner');
    if (!banner || !btn) return;

    if (isLiveConfigured()) {
      banner.innerHTML =
        '<span class="font-medium text-amber-soft">API linked</span>' +
        '<span class="hidden sm:inline"> — Worker URL set. First search will use live Grok (mock fallback if offline).</span>' +
        '<span class="sm:hidden"> — Worker set · live on search.</span>' +
        '<button type="button" id="dismiss-banner" class="ml-2 text-amber-200/70 hover:text-amber-100 underline text-xs" aria-label="Dismiss demo notice">Dismiss</button>';
    }

    try {
      if (sessionStorage.getItem('haulintel-banner-dismissed') === '1') {
        banner.classList.add('hidden');
      }
    } catch (_) {
      /* private mode */
    }

    document.getElementById('dismiss-banner')?.addEventListener('click', () => {
      banner.classList.add('hidden');
      try {
        sessionStorage.setItem('haulintel-banner-dismissed', '1');
      } catch (_) {
        /* ignore */
      }
    });
  }

  function initYear() {
    const y = document.getElementById('year');
    if (y) y.textContent = String(new Date().getFullYear());
  }

  // Deep-link ?q=Company
  function initQueryParam() {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get('q') || params.get('company');
      if (q) {
        runSearch(q, { scroll: true });
      }
    } catch (_) {
      /* ignore */
    }
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    initYear();
    initBanner();
    initNav();
    initCompanyPickers();
    initChat();
    initQueryParam();
  });
})();
