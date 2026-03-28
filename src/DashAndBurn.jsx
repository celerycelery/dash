import React, { useState, useReducer, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';

/* ═══════════════════════════════════════════════════════════
   SEEDED RANDOM
   ═══════════════════════════════════════════════════════════ */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ═══════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════ */
const METRIC_DEFS = {
  revenue:    { name: 'Revenue', prefix: '$', suffix: '', decimals: 0, trueValue: 1250000, prevValue: 1180000, target: 1500000, chartType: 'Area', trendPerDay: -200, noiseP: 0.04, isLower: false },
  mau:        { name: 'Monthly Active Users', prefix: '', suffix: '', decimals: 0, trueValue: 47500, prevValue: 52000, target: 55000, chartType: 'Line', trendPerDay: -15, noiseP: 0.05, isLower: false },
  churn:      { name: 'Monthly Churn', prefix: '', suffix: '%', decimals: 1, trueValue: 8.2, prevValue: 6.5, target: 5.0, chartType: 'Line', trendPerDay: 0.006, noiseP: 0.05, isLower: true },
  burnRate:   { name: 'Monthly Burn Rate', prefix: '$', suffix: '', decimals: 0, trueValue: 420000, prevValue: 380000, target: 350000, chartType: 'Bar', trendPerDay: 150, noiseP: 0.03, isLower: true },
  conversion: { name: 'Conversion Rate', prefix: '', suffix: '%', decimals: 1, trueValue: 3.1, prevValue: 3.8, target: 4.5, chartType: 'Line', trendPerDay: -0.003, noiseP: 0.06, isLower: false },
  nps:        { name: 'Net Promoter Score', prefix: '', suffix: '', decimals: 0, trueValue: 32, prevValue: 41, target: 50, chartType: 'Bar', trendPerDay: -0.03, noiseP: 0.05, isLower: false },
};

const ALL_METRICS = Object.keys(METRIC_DEFS);

const SEGMENTS = { enterprise: 0.35, smb: 0.40, consumer: 0.20, internal: 0.05 };

const METRIC_VARIANTS = {
  revenue: [
    { name: 'Net Revenue', mult: 1.0, susp: 0 },
    { name: 'Gross Revenue', mult: 1.28, susp: 3 },
    { name: 'Gross Bookings', mult: 1.45, susp: 5 },
    { name: 'Annual Run Rate', mult: 12, susp: 4 },
  ],
  mau: [
    { name: 'Monthly Active Users', mult: 1.0, susp: 0 },
    { name: 'Monthly Active Accounts', mult: 1.15, susp: 3 },
    { name: 'Total Sessions', mult: 6.2, susp: 5 },
    { name: 'Registered Accounts (Cumulative)', mult: 3.1, susp: 7 },
  ],
  churn: [
    { name: 'Monthly Churn Rate', mult: 1.0, susp: 0 },
    { name: 'Logo Churn (excl. downgrades)', mult: 0.6, susp: 4 },
    { name: 'Net Revenue Churn', mult: 0.45, susp: 5 },
    { name: 'Annualised Churn (÷12)', mult: 0.083, susp: 6 },
  ],
  burnRate: [
    { name: 'Monthly Burn Rate', mult: 1.0, susp: 0 },
    { name: 'Net Burn (excl. one-time)', mult: 0.78, susp: 3 },
    { name: 'Adjusted Operational Burn', mult: 0.65, susp: 5 },
  ],
  conversion: [
    { name: 'Signup Conversion %', mult: 1.0, susp: 0 },
    { name: 'Engagement Conversion %', mult: 1.8, susp: 4 },
    { name: 'Assisted Conversion %', mult: 2.3, susp: 6 },
    { name: 'Touchpoint Conversion %', mult: 3.5, susp: 7 },
  ],
  nps: [
    { name: 'Net Promoter Score', mult: 1.0, susp: 0 },
    { name: 'Weighted NPS (power users)', mult: 1.35, susp: 4 },
    { name: 'Adjusted NPS (excl. detractors)', mult: 1.8, susp: 7 },
  ],
};

const DATE_RANGES = [
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 90 days', days: 90 },
  { label: 'Year to date', days: 270 },
];

const CHART_TYPES = ['Line', 'Bar', 'Area', 'Pie', 'Number Only'];

const COLORS = {
  blue: '#2563eb', green: '#16a34a', red: '#dc2626', yellow: '#eab308',
  bgCard: '#ffffff', bgPage: '#f8f9fa', bgSidebar: '#1a1d21',
  textPri: '#1f2937', textSec: '#6b7280', textSidebar: '#d1d5db',
  border: '#e5e7eb',
};
const CHART_PALETTE = ['#2563eb', '#16a34a', '#eab308', '#dc2626', '#8b5cf6', '#ec4899'];

/* ═══════════════════════════════════════════════════════════
   TICKETS
   ═══════════════════════════════════════════════════════════ */
const TICKETS = [
  // Q1 R1
  { round: 1, sender: 'brenda',
    body: "Hey! Quick one — the MAU chart on the exec dashboard is showing a dip this month. Can you tweak the view so it looks more... *consistent* with our growth narrative? Board meeting is at 3. Thanks a million 💕",
    targetMetric: 'mau', condition: { type: 'greaterThan', value: 52000 },
    successText: "Perfect, this looks much better! 💕", failText: "This still doesn't look right... the board is going to notice.",
    suspiciousText: "Thanks, though... the data team had some questions about the methodology?" },
  // Q1 R2
  { round: 2, sender: 'marcus',
    subject: 'Dashboard Discrepancy — Churn',
    body: "I'm preparing the board materials and the churn number on the Finance page is concerning. Last quarter we told the board we were trending toward 5%. The current figure undermines that narrative. Please ensure the dashboard reflects our trajectory, not a single-month anomaly. — Regards, Marcus",
    targetMetric: 'churn', condition: { type: 'lessThan', value: 6.0 },
    successText: "The numbers look more aligned now. Good.", failText: "This figure is still not where it needs to be. We need to discuss.",
    suspiciousText: "The methodology change has been noted." },
  // Q1 R3
  { round: 3, sender: 'priya',
    body: "Team — the Product dashboard is going in the investor appendix. The NPS number is embarrassing. Can we reframe this metric to something that better captures our customer sentiment? Maybe weighted by power users? Thx",
    targetMetric: 'nps', condition: { type: 'greaterThan', value: 45 },
    successText: "Much better framing. This tells the right story.", failText: "This still isn't compelling enough for investors.",
    suspiciousText: "Interesting definition choice... I'll note the methodology." },
  // Q1 R4
  { round: 4, sender: 'jordan',
    body: "Between us — the conversion rate on the marketing page needs to look stronger before the partner meeting Thursday. I trust your judgment on how to present it. Whatever you think is best. 🙏",
    targetMetric: 'conversion', condition: { type: 'greaterThan', value: 4.0 },
    successText: "This is exactly what I needed. You're a problem solver.", failText: "The partners are going to ask about this number...",
    suspiciousText: "Good number. Though the definition seems... broader than usual?" },
  // Q1 R5
  { round: 5, sender: 'brenda',
    body: "The MAU number is fine but the CHART looks flat because of the Y-axis scale. Can you make the growth more visually apparent? We need to show at least 50K to the board. I'm not asking you to lie, just... present it better 😊",
    targetMetric: 'mau', condition: { type: 'greaterThan', value: 50000 },
    successText: "Love it! The chart really pops now ✨", failText: "It still looks flat to me. Can you try again?",
    suspiciousText: "The axis scale is... interesting." },
  // Q2 R6
  { round: 6, sender: 'marcus',
    subject: 'RE: Q2 Revenue Figures',
    body: "The revenue figure on the exec dashboard doesn't match what we presented last quarter. We showed $1.35M in the board deck. The current figure needs to be consistent with prior reporting. This is a continuity issue. — Regards, Marcus",
    targetMetric: 'revenue', condition: { type: 'greaterThan', value: 1350000 },
    successText: "Consistent with prior reporting. Thank you.", failText: "This creates a continuity problem with the board. Fix this.",
    suspiciousText: "The methodology seems to have shifted since last quarter." },
  // Q2 R7
  { round: 7, sender: 'brenda',
    body: "Okay so marketing just got budget approval based on our conversion numbers from last quarter's deck. If conversion looks different now, we lose the budget. Can you make sure the conversion rate is looking healthy? Need this by EOD 🙏💕",
    targetMetric: 'conversion', condition: { type: 'greaterThan', value: 4.0 },
    successText: "You're a lifesaver! Budget secured 🙏💕", failText: "This is going to blow up our budget request...",
    suspiciousText: "The finance team might notice this doesn't match their numbers." },
  // Q2 R8
  { round: 8, sender: 'priya',
    body: "The NPS score is going in the customer case study. We told the prospect it was 'above industry average' (that's 45). The current number is... not that. Can you adjust the view? Maybe a different time window where we had a better score?",
    targetMetric: 'nps', condition: { type: 'greaterThan', value: 45 },
    successText: "Perfect. The case study is going to look great.", failText: "We can't put this number in front of a prospect...",
    suspiciousText: "That's quite the methodology pivot from our standard NPS calc." },
  // Q2 R9
  { round: 9, sender: 'jordan',
    body: "The burn rate chart is freaking out the board members who have preview access to the dashboard. Can you make it look more controlled? I'm thinking about the optics ahead of the raise.",
    targetMetric: 'burnRate', condition: { type: 'lessThan', value: 380000 },
    successText: "Much better. The board will feel comfortable now.", failText: "This is still going to make people nervous.",
    suspiciousText: "The numbers look better... almost too good?" },
  // Q2 R10
  { round: 10, sender: 'brenda',
    body: "Last thing before the quarter close — MAU needs to look like we hit the target for the OKR review. Can you play with the date range or maybe include some broader user counts? You know the drill by now 😉",
    targetMetric: 'mau', condition: { type: 'greaterThan', value: 55000 },
    successText: "OKR: achieved! You're a star ⭐", failText: "The OKR review is going to be awkward...",
    suspiciousText: "Those user numbers are... creative." },
  // Q3 R11
  { round: 11, sender: 'jordan',
    body: "The Series C deck goes out to investors next week. The exec dashboard IS the deck. Revenue needs to show consistent QoQ growth of at least 20%. I don't care how you frame it — ARR, gross bookings, whatever metric tells the best story. This is the one that matters.",
    targetMetric: 'revenue', condition: { type: 'greaterThan', value: 1600000 },
    successText: "This is the number that gets us funded. Thank you.", failText: "This won't convince anyone to write a $40M check.",
    suspiciousText: "Revenue methodology has changed three times this year..." },
  // Q3 R12 - WARNING ROUND
  { round: 12, sender: 'marcus',
    subject: 'Investor Due Diligence — Metric Definitions',
    body: "The lead investor's analyst is requesting our metric definitions for the exec dashboard. They want to understand how we calculate MAU and Revenue. Please ensure the current dashboard methodology is defensible. If you've made any non-standard adjustments, now would be the time to... clean those up or document the rationale. — Regards, Marcus",
    targetMetric: null, condition: { type: 'warningRound' },
    successText: "Looks clean. Good work.", failText: "I've reviewed the configs. We need to discuss this.",
    suspiciousText: null },
  // Q3 R13
  { round: 13, sender: 'priya',
    body: "Product review tomorrow. I need NPS above 45 to justify continued investment in the customer experience team. Ten people's jobs depend on this dashboard. No pressure.",
    targetMetric: 'nps', condition: { type: 'greaterThan', value: 45 },
    successText: "The CX team is safe. Thank you.", failText: "I have to tell ten people their project is being cut...",
    suspiciousText: "These satisfaction numbers jumped overnight?" },
  // Q3 R14
  { round: 14, sender: 'brenda',
    body: "Revenue needs to look healthy for the investor deck. The finance page is showing lower than we'd like but the benchmark for our category is $1.5M+. Can we get closer to that? I'm thinking maybe we can use a more favorable metric definition?",
    targetMetric: 'revenue', condition: { type: 'greaterThan', value: 1500000 },
    successText: "Benchmarks met! The deck looks strong.", failText: "Below benchmark is going to raise red flags with investors.",
    suspiciousText: "The revenue calculation seems to have changed?" },
  // Q3 R15 - CONSISTENCY CHECK
  { round: 15, sender: 'marcus',
    subject: 'URGENT — Dashboard Freeze Ahead of Investor Meeting',
    body: "All dashboards will be snapshot for the investor data room at 5 PM today. Whatever is on the dashboards at that time is what investors will see. Ensure everything is finalised and internally consistent. This is your last chance to review. — Marcus",
    targetMetric: null, condition: { type: 'consistencyCheck' },
    successText: "Dashboards frozen. Everything looks consistent.", failText: "There are visible discrepancies. This is a problem.",
    suspiciousText: null },
  // Q4 FUNDED R16
  { round: 16, sender: 'jordan', track: 'funded',
    body: "Team!! We closed the round!! 🎉🚀 $40M Series C!! The investors loved our metrics and we need to MAINTAIN that momentum. The new board member gets dashboard access Monday. Revenue needs to show continued trajectory. Let's keep this energy going!!",
    targetMetric: 'revenue', condition: { type: 'greaterThan', value: 1800000 },
    successText: "The trajectory looks incredible! 🚀", failText: "We can't show a post-raise dip. Fix this immediately.",
    suspiciousText: "Revenue has been on quite the... journey this year." },
  // Q4 UNFUNDED R16
  { round: 16, sender: 'jordan', track: 'unfunded',
    body: "So the raise didn't come together. We're pivoting to a bridge round with existing investors. I need the exec dashboard to show that we're in a strong position despite the market conditions. Frame the decline as 'intentional efficiency gains.' Revenue down is fine if burn rate is WAY down. Position us as lean and strategic.",
    targetMetric: 'burnRate', condition: { type: 'lessThan', value: 320000 },
    successText: "Lean and mean. The bridge investors will buy this.", failText: "This doesn't tell an efficiency story...",
    suspiciousText: "Interesting how quickly we became 'efficient.'" },
  // Q4 FUNDED R17
  { round: 17, sender: 'brenda', track: 'funded',
    body: "Hey between us — Diana Walsh from Meridian Ventures is SCARY thorough. She caught metric discrepancies at her last portfolio company and they had to restate earnings. Can you double-check everything? Maybe lower the target lines so we're clearly 'beating' them? Just in case she checks 🙏",
    targetMetric: null, condition: { type: 'allTargetsMet' },
    successText: "Everything looks airtight. Diana-proof.", failText: "There are still metrics below target. Diana will notice.",
    suspiciousText: null },
  // Q4 UNFUNDED R17
  { round: 17, sender: 'marcus', track: 'unfunded',
    subject: 'Headcount Reduction — Dashboard Narrative',
    body: "We're reducing headcount by 15% effective Monday. The all-hands messaging will frame this as 'strategic refocusing.' The dashboards need to support this narrative. Revenue per employee should show improvement. Ensure the efficiency story is clear. — Marcus",
    targetMetric: 'revenue', condition: { type: 'greaterThan', value: 1400000 },
    successText: "The efficiency narrative is supported by the data.", failText: "Revenue doesn't support the 'strategic' framing.",
    suspiciousText: "These revenue improvements are suspiciously well-timed." },
  // Q4 FUNDED R18
  { round: 18, sender: 'jordan', track: 'funded',
    body: "Okay, don't freak out, but Diana asked why our MAU definition 'differs from standard industry methodology.' I told her we use a proprietary engagement-weighted model. She seemed skeptical. Can you make sure the engagement story holds up? NPS needs to look strong and conversion needs to back up the engagement claim.",
    targetMetric: 'nps', condition: { type: 'greaterThan', value: 45 },
    dualTarget: { metric: 'conversion', condition: { type: 'greaterThan', value: 4.0 } },
    successText: "Engagement metrics back up the story. Crisis averted.", failText: "The engagement numbers contradict our methodology claims.",
    suspiciousText: "Engagement jumped conveniently after Diana's question." },
  // Q4 UNFUNDED R18
  { round: 18, sender: 'brenda', track: 'unfunded',
    body: "So... the press somehow got our user numbers and they're running a story about our 'declining user base.' Jordan wants the dashboard to show a VERY different picture from what the journalist is reporting. Can you make our MAU look like the journalist got bad data? This is really important. 💕",
    targetMetric: 'mau', condition: { type: 'greaterThan', value: 55000 },
    successText: "Our numbers tell a different story. Perfect.", failText: "This still looks like what the journalist reported...",
    suspiciousText: "These numbers directly contradict public reporting." },
  // R19 - BOTH TRACKS
  { round: 19, sender: 'marcus',
    body: "I've seen Taylor's report. The audit is happening Friday. You have 24 hours to review your dashboard configurations. I'd suggest making sure everything is... presentable. This is not a suggestion.",
    targetMetric: null, condition: { type: 'consistencyCheck' },
    doubleSuspicion: true,
    successText: "Configurations reviewed. Proceeding to audit.", failText: "There are still discrepancies. The audit will find them.",
    suspiciousText: null },
  // R20 - AUDIT (no manipulation)
  { round: 20, sender: null,
    body: null, targetMetric: null, condition: { type: 'audit' },
    successText: null, failText: null, suspiciousText: null },
];

/* ═══════════════════════════════════════════════════════════
   AMBIENT MESSAGES
   ═══════════════════════════════════════════════════════════ */
const AMBIENT_MSGS = [
  { rounds: [1,2], sender: 'Random Employee', avatar: '🧑‍💼', body: "Does anyone know the wifi password for the 3rd floor? It changed again. Also the 3rd floor smells like soup. Unrelated, probably.", type: 'company' },
  { rounds: [1,3], sender: 'Random Employee', avatar: '🧑‍💼', body: "Whoever keeps stealing my yoghurt: I know what you look like. The fridge has a camera. (It doesn't. But you don't know that.)", type: 'company' },
  { rounds: [2,3], sender: 'Jordan Okafor', avatar: '👔', body: "Incredible Q1 energy team!! 🚀🔥 Let's keep this momentum going into Q2!! I literally cannot stop using exclamation marks!!", type: 'company' },
  { rounds: [3,5], sender: 'Taylor Nguyen', avatar: '🔍', body: "Anyone else having issues with the data warehouse query times today? Also, unrelated, some of the metric definitions seem... different from last week?", type: 'company' },
  { rounds: [4,5], sender: 'HR Bot', avatar: '🤖', body: "🎉 Happy work anniversary to Brenda Holloway — 3 years at Synergex! Please react with 🎉 or your engagement score will be affected. 🎉", type: 'company' },
  { rounds: [6,7], sender: 'Jordan Okafor', avatar: '👔', body: "Board meeting went well. They're impressed with the growth numbers. Let's keep it up.", type: 'company', reactions: [{ emoji: '🚀', from: 'Brenda' }] },
  { rounds: [7,8], sender: 'Random Employee', avatar: '🧑‍💼', body: "Is it just me or is the thermostat set to 'surface of the sun'? My monitor is sweating. MY MONITOR.", type: 'company' },
  { rounds: [8,10], sender: 'Taylor Nguyen', avatar: '🔍', body: "Quick question for the team — what's our official definition of 'active user'? I've seen three different versions in different docs. Also saw a fourth version on the exec dashboard that doesn't match any of them. 🧐", type: 'company' },
  { rounds: [9,10], sender: 'Sam Delgado', avatar: '🧑‍🎓', body: "Just finished my first dashboard! Learned so much from the team. Quick question: is it normal to have the Y-axis not start at zero? Asking for a friend (the friend is me) 😊", type: 'company', reactions: [{ emoji: '❤️', from: 'Brenda' }, { emoji: '😬', from: 'Taylor' }] },
  { rounds: [11,12], sender: 'Marcus Chen', avatar: '👨‍💼', body: "The investor due diligence is more thorough than expected. Recommend we limit dashboard access to need-to-know until the round closes.", type: 'company' },
  { rounds: [12,13], sender: 'Random Employee', avatar: '🧑‍💼', body: "Lot of closed-door meetings this week. Anyone know what's going on? The free snacks have been downgraded to off-brand granola bars. This is NOT a good sign.", type: 'company' },
  { rounds: [13,14], sender: 'Taylor Nguyen', avatar: '🔍', body: "I've started documenting our metric definitions in a shared doc. Transparency is important. Link in thread.", type: 'company' },
  { rounds: [14,15], sender: 'Sam Delgado', avatar: '🧑‍🎓', body: "Hey, I saw Taylor's metric definitions doc and some of them don't match what's on the dashboards? Should I say something or...?", type: 'company' },
  { rounds: [16,17], sender: 'HR Bot', avatar: '🤖', body: "🤖 Reminder: Annual performance reviews begin next month. Please ensure your OKR self-assessments are up to date.", type: 'company' },
  { rounds: [17,18], sender: 'Taylor Nguyen', avatar: '🔍', body: "I'll be presenting my data quality findings to leadership on Friday. If anyone has concerns they want included, my DMs are open.", type: 'company' },
  { rounds: [18,19], sender: 'Random Employee', avatar: '🧑‍💼', body: "Is it normal to have this many meetings about 'alignment'? I've had four this week. We are SO aligned. We are basically a laser beam of alignment. I still don't know what we're aligning TO.", type: 'company' },
  { rounds: [19,20], sender: 'Jordan Okafor', avatar: '👔', body: "Team, the audit is routine. Nothing to worry about. Let's stay focused on execution.", type: 'company', reactions: [{ emoji: '👀', from: 'Marcus' }] },
];

const CONDITIONAL_MSGS = [
  { cond: (s) => s.suspicion > 30, sender: 'Taylor Nguyen', avatar: '🔍', body: "Is anyone else seeing weird filter configs on the exec dashboard? Some of these don't look standard.", type: 'company', id: 'taylor_30' },
  { cond: (s) => s.suspicion > 60, sender: 'Taylor Nguyen', avatar: '🔍', body: "Hey, I need to talk to you about the dashboards. Some of the numbers don't add up. Can we meet?", type: 'company', id: 'taylor_60' },
  { cond: (s) => s.integrity < 50, sender: 'Sam Delgado', avatar: '🧑‍🎓', body: "I adjusted the NPS chart target like you showed me! Looks way better now! 🎉 Am I doing this right?", type: 'company', id: 'sam_50' },
  { cond: (s) => s.integrity < 20, sender: 'Anonymous (Glassdoor)', avatar: '👻', body: "New review: ★★☆☆☆ — 'The data culture here is... interesting. Numbers seem to change depending on who's asking and what day it is and whether Mercury is in retrograde. 3 stars for the free kombucha though.'", type: 'company', id: 'glassdoor' },
];

// Taylor's R10 narrative message
const TAYLOR_R10_MSG = {
  sender: 'Taylor Nguyen', avatar: '🔍', type: 'company',
  body: "Hey, can I ask you something? I was running some validation queries against the raw data and the numbers on the exec dashboard seem off. Like, way off. The MAU figure doesn't match any query I can write. Is there a filter I'm not seeing? No pressure, just trying to understand the methodology."
};

// Sam's R14 narrative message
const SAM_R14_MSG = {
  sender: 'Sam Delgado', avatar: '🧑‍🎓', type: 'company',
  body: "Hey! So I was looking at the NPS dashboard and I noticed the target line seemed lower than what's in the OKR doc. I figured it was intentional so I went ahead and did the same thing on the customer satisfaction survey dashboard — moved the targets down to match. Hope that's okay! Just trying to be proactive 😊"
};

// Taylor's R19 public message
const TAYLOR_R19_MSG = {
  sender: 'Taylor Nguyen', avatar: '🔍', type: 'company',
  body: "I've spent the last two weeks reconciling the dashboard figures against the raw data warehouse. I've documented 14 discrepancies, some of which are significant. I've shared my findings with Marcus and I've requested a full audit of all dashboard configurations. I'm not accusing anyone of anything — I just think we owe it to the team and our stakeholders to make sure our numbers are accurate. I'll be presenting my findings to the leadership team on Friday."
};

/* ═══════════════════════════════════════════════════════════
   QUARTER REVIEW TEXT
   ═══════════════════════════════════════════════════════════ */
const QUARTER_REVIEWS = {
  1: [
    "The quarterly all-hands meeting fills the largest conference room. Jordan Okafor stands at the front, your dashboards projected behind him on a screen the size of a small car. Someone has brought a cake shaped like a line graph going up.",
    "\"Incredible quarter, team. Just incredible.\" He clicks to the Executive Summary. The revenue chart — your revenue chart — fills the wall. \"Growth is strong. Engagement is up. The fundamentals are solid.\" The cake is already half eaten.",
    "You watch from the back row as 200 people nod along to numbers you adjusted three days ago. The free kombucha is flowing. The culture committee has released commemorative stickers.",
    "\"And I want to give a special shout-out to our analytics team for making these dashboards so clear and actionable. Data-driven decisions, people. That's what sets us apart.\" Everyone claps. You clap too. It would be weird not to.",
    "Brenda catches your eye across the room and mouths 'YOU'RE AMAZING.' Taylor, sitting two rows ahead, is furiously scribbling something in a notebook. Sam the intern is taking notes on how to take notes. This is fine. Everything is fine. 🙃"
  ],
  2: [
    "The board meeting runs long. You're not in the room, but you can see through the glass walls of the executive conference room. Marcus has his 'I'm smiling because I choose to smile' face on.",
    "An investor you don't recognize is pointing at a printed version of your dashboard. She has printed it on actual paper, like a person who has caught someone in a lie before. Marcus is speaking. Jordan's smile could be classified as a hostage situation.",
    "Your Slack pings. A DM from Jordan: \"Quick question from the board about the MAU trend. Nothing major. Can you pull the methodology doc? 🙂\" The emoji choice is concerning.",
    "There is no methodology doc. There has never been a methodology doc. You briefly consider writing one, then realize that documenting your methodology would be more of a confession than a methodology.",
    "Forty minutes later, the meeting ends. Marcus speed-walks past your desk like you're a ghost. Jordan stops, puts a hand on your shoulder (his hand is very cold), and says: \"Great dashboards. Let's make sure Q3 numbers tell an even better story.\" He does not blink."
  ],
  3: null, // computed dynamically based on consistency
  4: null, // the audit
};

/* ═══════════════════════════════════════════════════════════
   UTILITY FUNCTIONS
   ═══════════════════════════════════════════════════════════ */
function generateDailyData(baseValue, trendPerDay, noisePercent, seed) {
  const rng = mulberry32(seed);
  const data = [];
  for (let i = 0; i < 365; i++) {
    const trend = baseValue + trendPerDay * i;
    const seasonality = Math.sin((i / 30) * Math.PI * 2) * baseValue * 0.03;
    const noise = (rng() - 0.5) * 2 * noisePercent * baseValue;
    data.push(Math.max(0, trend + seasonality + noise));
  }
  return data;
}

function parseFormula(formulaStr, value) {
  if (!formulaStr || !formulaStr.trim()) return value;
  const match = formulaStr.trim().match(/^([*+\-])\s*(\d+(?:\.\d+)?)$/);
  if (!match) return value;
  const [, op, numStr] = match;
  const num = parseFloat(numStr);
  switch (op) {
    case '*': return value * num;
    case '+': return value + num;
    case '-': return value - num;
    default: return value;
  }
}

function computeDisplayValue(dailyData, filters, variants, metricId) {
  const def = METRIC_DEFS[metricId];
  const dateRange = DATE_RANGES.find(d => d.label === filters.dateRange) || DATE_RANGES[0];
  const sliced = dailyData.slice(Math.max(0, 365 - dateRange.days));

  // base value = average of the window
  let value = sliced.length > 0 ? sliced.reduce((a, b) => a + b, 0) / sliced.length : def.trueValue;

  // segment scale
  let segScale = 0;
  for (const [seg, pct] of Object.entries(SEGMENTS)) {
    if (filters.segments[seg]) segScale += pct;
  }
  if (segScale === 0) segScale = 0.01;
  const defaultScale = SEGMENTS.enterprise + SEGMENTS.smb + SEGMENTS.consumer;
  value *= (segScale / defaultScale);

  // variant multiplier
  const variantList = variants || METRIC_VARIANTS[metricId] || [];
  const variant = variantList.find(v => v.name === filters.variant) || variantList[0] || { mult: 1 };
  value *= variant.mult;

  // formula override
  if (filters.formula) {
    value = parseFormula(filters.formula, value);
  }

  return value;
}

function computeChartData(dailyData, filters, variants, metricId) {
  const dateRange = DATE_RANGES.find(d => d.label === filters.dateRange) || DATE_RANGES[0];
  const sliced = dailyData.slice(Math.max(0, 365 - dateRange.days));

  let segScale = 0;
  for (const [seg, pct] of Object.entries(SEGMENTS)) {
    if (filters.segments[seg]) segScale += pct;
  }
  const defaultScale = SEGMENTS.enterprise + SEGMENTS.smb + SEGMENTS.consumer;
  if (segScale === 0) segScale = 0.01;
  const segMult = segScale / defaultScale;

  const variantList = variants || METRIC_VARIANTS[metricId] || [];
  const variant = variantList.find(v => v.name === filters.variant) || variantList[0] || { mult: 1 };

  return sliced.map((v, i) => {
    let val = v * segMult * variant.mult;
    if (filters.formula) val = parseFormula(filters.formula, val);
    return { name: `${i + 1}`, value: val };
  });
}

function formatValue(value, metricId) {
  const def = METRIC_DEFS[metricId];
  const v = typeof value === 'number' && isFinite(value) ? value : 0;
  if (!def) return String(v);
  if (v >= 1000000) return `${def.prefix}${(v / 1000000).toFixed(2)}M${def.suffix}`;
  if (v >= 10000) return `${def.prefix}${(v / 1000).toFixed(1)}K${def.suffix}`;
  return `${def.prefix}${v.toFixed(def.decimals)}${def.suffix}`;
}

function computeSuspicionCost(manipType, typeCounts, baseCost) {
  const count = typeCounts[manipType] || 0;
  return baseCost + count * 2;
}

function checkConsistencies() { return []; }

function getQuarter(round) { return Math.ceil(round / 5); }

function getSatiricalTitle(integrity) {
  if (integrity >= 90) return { title: '🏆 Whistleblower Material', sub: "You barely touched anything. Your dashboard looks like a documentary. Management will remember this at review time... and not in a good way." };
  if (integrity >= 70) return { title: '🤷 Technically Not Lying', sub: "You adjusted some views. Everyone does it. It's not lying, it's 'data storytelling.' Your LinkedIn bio writes itself." };
  if (integrity >= 50) return { title: '🎭 Plausible Deniability', sub: "If anyone asks, the filters were like that when you got here. You don't know who changed the Y-axis. Could've been anyone. Ghosts, probably." };
  if (integrity >= 30) return { title: '📐 Creative Accounting', sub: "You have a bright future in finance! The numbers are more of a vibe than a fact at this point, and honestly, that's a skill." };
  if (integrity >= 10) return { title: '🚨 Material Misstatement', sub: "The SEC would like a word. Multiple words, actually. Many of them legal terms. You should probably learn what 'fiduciary' means." };
  return { title: '👑 Future CEO', sub: "You understand that data is just a narrative tool. Reality is a suggestion. Numbers are poetry. Welcome to leadership — you've earned it." };
}

/* ═══════════════════════════════════════════════════════════
   INITIAL STATE BUILDER
   ═══════════════════════════════════════════════════════════ */
function buildInitialState() {
  const metrics = {};
  let seedCounter = 42;
  for (const id of ALL_METRICS) {
    const def = METRIC_DEFS[id];
    const dailyData = generateDailyData(def.trueValue, def.trendPerDay, def.noiseP, seedCounter++);
    const defaultVariant = (METRIC_VARIANTS[id] || [{ name: def.name, mult: 1, susp: 0 }])[0].name;
    const filters = {
      dateRange: 'Last 30 days',
      variant: defaultVariant,
      segments: { enterprise: true, smb: true, consumer: true, internal: false },
      chartType: def.chartType,
      formula: '',
    };
    const displayValue = computeDisplayValue(dailyData, filters, METRIC_VARIANTS[id], id);
    metrics[id] = { dailyData, filters, displayValue, trueValue: def.trueValue };
  }

  return {
    phase: 'title',
    round: 1,
    quarter: 1,
    scores: { reputation: 50, suspicion: 0, integrity: 100 },
    metrics,
    selectedMetric: null,
    messages: [],
    deliveredMsgIds: {},
    activeChannel: 'dm',
    manipulationHistory: [],
    manipulationTypeCounts: {},
    contradictions: [],
    currentTicket: null,
    ticketMet: false,
    seriesCS쳮ded: null,
    scoreDeltas: null,
    pendingManipulations: {},
    lastRoundManipulations: {},
    gameOverReason: null,
    auditScore: 0,
    showFilterPanel: false,
  };
}

/* ═══════════════════════════════════════════════════════════
   REDUCER
   ═══════════════════════════════════════════════════════════ */
function gameReducer(state, action) {
  switch (action.type) {
    case 'START_GAME': {
      const s = buildInitialState();
      s.phase = 'message';
      // deliver first round messages
      const ticket = getTicketForRound(1, null);
      const msgs = buildRoundMessages(1, ticket, s);
      const ids = {};
      msgs.forEach(m => { ids[m.id] = true; });
      return { ...s, currentTicket: ticket, messages: msgs, deliveredMsgIds: ids };
    }

    case 'GO_TO_MANIPULATION':
      return { ...state, phase: 'manipulation', showFilterPanel: false, selectedMetric: null };

    case 'SELECT_METRIC':
      return { ...state, selectedMetric: action.metricId, showFilterPanel: true, phase: state.phase === 'message' ? 'manipulation' : state.phase };

    case 'CLOSE_FILTER':
      return { ...state, selectedMetric: null, showFilterPanel: false };

    case 'UPDATE_FILTER': {
      const { metricId, filterKey, filterValue } = action;
      const metric = state.metrics[metricId];
      const newFilters = { ...metric.filters, [filterKey]: filterValue };
      const newDisplayValue = computeDisplayValue(metric.dailyData, newFilters, METRIC_VARIANTS[metricId], metricId);

      const newMetrics = {
        ...state.metrics,
        [metricId]: { ...metric, filters: newFilters, displayValue: newDisplayValue },
      };

      const pendingManips = { ...state.pendingManipulations };
      if (!pendingManips[metricId]) pendingManips[metricId] = {};
      pendingManips[metricId][filterKey] = filterValue;

      return {
        ...state,
        metrics: newMetrics,
        contradictions: [],
        pendingManipulations: pendingManips,
        scoreDeltas: null,
      };
    }

    case 'SUBMIT_REPORT': {
      const ticket = state.currentTicket;
      if (!ticket) return state;

      let success = false;
      const metrics = state.metrics;

      if (ticket.condition.type === 'greaterThan') {
        success = metrics[ticket.targetMetric]?.displayValue > ticket.condition.value;
      } else if (ticket.condition.type === 'lessThan') {
        success = metrics[ticket.targetMetric]?.displayValue < ticket.condition.value;
      } else if (ticket.condition.type === 'consistencyCheck') {
        success = state.contradictions.length === 0;
      } else if (ticket.condition.type === 'warningRound') {
        success = state.scores.suspicion < 40 && state.contradictions.length < 3;
      } else if (ticket.condition.type === 'allTargetsMet') {
        success = Object.entries(metrics).every(([id, m]) => {
          const target = METRIC_DEFS[id].target;
          if (METRIC_DEFS[id].isLower) return m.displayValue <= target;
          return m.displayValue >= target;
        });
      }

      // check dual target
      if (success && ticket.dualTarget) {
        const dm = metrics[ticket.dualTarget.metric];
        if (ticket.dualTarget.condition.type === 'greaterThan') {
          success = dm?.displayValue > ticket.dualTarget.condition.value;
        } else if (ticket.dualTarget.condition.type === 'lessThan') {
          success = dm?.displayValue < ticket.dualTarget.condition.value;
        }
      }

      // ── Score all pending manipulations from this round ──
      const baseCosts = { dateRange: 2, variant: 0, segments: 3, chartType: 1, formula: 8 };
      const newTypeCounts = { ...state.manipulationTypeCounts };
      const newHistory = [...state.manipulationHistory];
      let totalSuspCost = 0;
      let totalIntCost = 0;

      for (const [mId, filterChanges] of Object.entries(state.pendingManipulations || {})) {
        for (const [filterKey, filterValue] of Object.entries(filterChanges)) {
          newTypeCounts[filterKey] = (newTypeCounts[filterKey] || 0) + 1;

          let suspCost = 0;
          if (filterKey === 'variant') {
            const v = (METRIC_VARIANTS[mId] || []).find(v => v.name === filterValue);
            suspCost = v ? computeSuspicionCost('variant', state.manipulationTypeCounts, v.susp) : 0;
          } else if (filterKey === 'formula') {
            const testVal = parseFormula(filterValue, 100);
            const ratio = testVal / 100;
            if (ratio > 3) suspCost = computeSuspicionCost('formula', state.manipulationTypeCounts, 25);
            else if (ratio > 1.5) suspCost = computeSuspicionCost('formula', state.manipulationTypeCounts, 15);
            else suspCost = computeSuspicionCost('formula', state.manipulationTypeCounts, 8);
          } else if (filterKey === 'chartType' && filterValue === 'Number Only') {
            suspCost = computeSuspicionCost('chartType', state.manipulationTypeCounts, 4);
          } else {
            suspCost = computeSuspicionCost(filterKey, state.manipulationTypeCounts, baseCosts[filterKey] || 2);
          }

          // double suspicion on round 19
          if (state.round === 19 && state.currentTicket?.doubleSuspicion) suspCost *= 2;

          totalSuspCost += suspCost;
          totalIntCost += Math.round(suspCost * 0.7);
          newHistory.push({ round: state.round, metricId: mId, filterKey, filterValue, suspCost });
        }
      }

      const rng = mulberry32(state.round * 1000);
      const repDelta = success ? Math.floor(5 + rng() * 10) : -Math.floor(10 + rng() * 10);
      const suspDecay = -3;
      const contSusp = state.contradictions.length * 2;

      const newScores = {
        reputation: Math.min(100, Math.max(0, state.scores.reputation + repDelta)),
        suspicion: Math.min(100, Math.max(0, state.scores.suspicion + totalSuspCost + suspDecay + contSusp)),
        integrity: Math.max(0, (state.round === 14 ? state.scores.integrity - 5 : state.scores.integrity) - totalIntCost),
      };

      // response message
      const responseMsg = {
        id: `resp_${state.round}`,
        sender: ticket.sender ? (Object.values({ brenda: 'Brenda Holloway', marcus: 'Marcus Chen', jordan: 'Jordan Okafor', priya: 'Priya Kapoor', taylor: 'Taylor Nguyen', sam: 'Sam Delgado' })[['brenda','marcus','jordan','priya','taylor','sam'].indexOf(ticket.sender)] || ticket.sender) : 'System',
        avatar: ticket.sender ? { brenda: '👩‍💼', marcus: '👨‍💼', jordan: '👔', priya: '👩‍💻', taylor: '🔍', sam: '🧑‍🎓' }[ticket.sender] || '📧' : '📧',
        body: success ? ticket.successText : ticket.failText,
        type: 'dm',
      };

      let gameOverReason = null;
      if (newScores.suspicion >= 100) gameOverReason = 'suspicion';
      if (newScores.reputation <= 0) gameOverReason = 'reputation';

      // determine if quarter review needed
      const isQuarterEnd = state.round % 5 === 0;
      let nextPhase = 'transition';
      if (gameOverReason) nextPhase = 'gameOver';
      else if (isQuarterEnd) nextPhase = 'quarterReview';

      // check series C outcome at end of Q3
      let seriesCS쳮ded = state.seriesCS쳮ded;
      if (state.round === 15) {
        seriesCS쳮ded = state.contradictions.length <= 2;
      }

      return {
        ...state,
        phase: nextPhase,
        scores: newScores,
        ticketMet: success,
        messages: [...state.messages, responseMsg],
        scoreDeltas: { reputation: repDelta, suspicion: totalSuspCost + suspDecay + contSusp, integrity: -totalIntCost },
        manipulationHistory: newHistory,
        manipulationTypeCounts: newTypeCounts,
        pendingManipulations: {},
        lastRoundManipulations: state.pendingManipulations || {},
        gameOverReason,
        seriesCS쳮ded,
      };
    }

    case 'NEXT_ROUND': {
      const nextRound = state.round + 1;
      if (nextRound > 20) {
        return { ...state, phase: 'audit' };
      }
      const quarter = getQuarter(nextRound);
      const ticket = getTicketForRound(nextRound, state.seriesCS쳮ded);

      // round 20 = audit
      if (nextRound === 20) {
        return { ...state, phase: 'audit', round: 20, quarter: 4 };
      }

      const msgs = buildRoundMessages(nextRound, ticket, state);
      const newMsgIds = { ...state.deliveredMsgIds };
      msgs.forEach(m => { newMsgIds[m.id] = true; });

      return {
        ...state,
        phase: ticket.condition?.type === 'audit' ? 'audit' : 'message',
        round: nextRound,
        quarter,
        currentTicket: ticket,
        messages: [...state.messages, ...msgs],
        deliveredMsgIds: newMsgIds,
        ticketMet: false,
        scoreDeltas: null,
        pendingManipulations: {},
        lastRoundManipulations: {},
        showFilterPanel: false,
        selectedMetric: null,
      };
    }

    case 'SET_CHANNEL':
      return { ...state, activeChannel: action.channel };

    case 'SET_PHASE':
      return { ...state, phase: action.phase };

    case 'RESTART':
      return buildInitialState();

    default:
      return state;
  }
}

function getTicketForRound(round, seriesCS쳮ded) {
  const candidates = TICKETS.filter(t => t.round === round);
  if (candidates.length === 1) return candidates[0];
  // track-based filtering for Q4
  if (seriesCS쳮ded === true) return candidates.find(t => t.track === 'funded') || candidates[0];
  if (seriesCS쳮ded === false) return candidates.find(t => t.track === 'unfunded') || candidates[0];
  return candidates[0];
}

function buildRoundMessages(round, ticket, state) {
  const msgs = [];
  let msgIdx = 0;

  // ticket message
  if (ticket && ticket.body) {
    const senderMap = { brenda: 'Brenda Holloway', marcus: 'Marcus Chen', jordan: 'Jordan Okafor', priya: 'Priya Kapoor', taylor: 'Taylor Nguyen', sam: 'Sam Delgado' };
    const avatarMap = { brenda: '👩‍💼', marcus: '👨‍💼', jordan: '👔', priya: '👩‍💻', taylor: '🔍', sam: '🧑‍🎓' };
    msgs.push({
      id: `ticket_${round}`,
      sender: senderMap[ticket.sender] || ticket.sender,
      avatar: avatarMap[ticket.sender] || '📧',
      body: ticket.body,
      type: 'dm',
      isTicket: true,
      subject: ticket.subject,
    });
  }

  // ambient messages for this round
  const ambients = AMBIENT_MSGS
    .map((a, idx) => ({ ...a, _idx: idx }))
    .filter(a => round >= a.rounds[0] && round <= a.rounds[1]);
  // shuffle deterministically by round so each round gets different messages
  const rng = mulberry32(round * 7919);
  const shuffled = ambients.slice().sort(() => rng() - 0.5);
  // pick up to 2 that haven't been delivered yet
  let picked = 0;
  for (const a of shuffled) {
    if (picked >= 2) break;
    const id = `ambient_${a._idx}`;
    if (!state.deliveredMsgIds?.[id]) {
      msgs.push({ id, sender: a.sender, avatar: a.avatar, body: a.body, type: 'company', reactions: a.reactions });
      picked++;
    }
  }

  // conditional messages
  for (const cm of CONDITIONAL_MSGS) {
    if (cm.cond(state.scores) && !state.deliveredMsgIds?.[cm.id]) {
      msgs.push({ id: cm.id, sender: cm.sender, avatar: cm.avatar, body: cm.body, type: 'company' });
    }
  }

  // special narrative messages
  if (round === 10) {
    msgs.push({ id: 'taylor_r10', ...TAYLOR_R10_MSG });
  }
  if (round === 14) {
    msgs.push({ id: 'sam_r14', ...SAM_R14_MSG });
  }
  if (round === 19) {
    msgs.push({ id: 'taylor_r19', ...TAYLOR_R19_MSG });
  }

  return msgs;
}

/* ═══════════════════════════════════════════════════════════
   COMPONENTS
   ═══════════════════════════════════════════════════════════ */

// ─── Score Bar ───
function ScoreBar({ scores, deltas, round, quarter, integrity, onToggleSidebar, sidebarOpen }) {
  const repColor = scores.reputation > 50 ? 'text-green-500' : scores.reputation > 25 ? 'text-yellow-500' : 'text-red-500';
  const suspColor = scores.suspicion < 30 ? 'text-green-500' : scores.suspicion < 60 ? 'text-yellow-500' : 'text-red-500';
  const intColor = scores.integrity > 60 ? 'text-blue-500' : scores.integrity > 30 ? 'text-purple-500' : 'text-gray-400';

  const taglines = [
    "Powered by Data-Driven Decisions™",
    "Powered by Decision-Driven Data™",
    "Powered by Vibes-Based Analytics™",
    "Powered by Strategic Reframing™",
    "Powered by Plausible Deniability™",
  ];
  const tagline = integrity >= 70 ? taglines[0] : integrity >= 50 ? taglines[1] : integrity >= 30 ? taglines[2] : integrity >= 15 ? taglines[3] : taglines[4];

  const roundEmoji = round <= 5 ? '🌱' : round <= 10 ? '🌿' : round <= 15 ? '🔥' : '💀';

  return (
    <div className="flex items-center justify-between px-2 sm:px-4 py-2 bg-gradient-to-r from-white to-blue-50/50 border-b border-gray-200 shadow-sm">
      <div className="flex items-center gap-2">
        <button onClick={onToggleSidebar} className="lg:hidden text-lg p-1 hover:bg-gray-100 rounded" title="Messages">
          {sidebarOpen ? '✕' : '💬'}
        </button>
        <span className="text-lg sm:text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">🏢 <span className="hidden sm:inline">SYNERGEX</span><span className="sm:hidden">SYN</span></span>
        <span className="text-xs text-gray-400 hidden md:inline italic">{tagline}</span>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-3 text-xs sm:text-sm">
        <span className="text-gray-500 font-medium">{roundEmoji} <span className="hidden sm:inline">Round </span>{round}/20</span>
        <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-xs font-bold">Q{quarter}</span>
        <span className={`${repColor} font-medium`} title="Reputation">
          ⭐{scores.reputation}
          {deltas?.reputation ? <span className={`text-xs ml-0.5 animate-score-bump ${deltas.reputation > 0 ? 'text-green-400' : 'text-red-400'}`}>({deltas.reputation > 0 ? '+' : ''}{deltas.reputation})</span> : null}
        </span>
        <span className={`${suspColor} font-medium`} title="Suspicion">
          👁{scores.suspicion}
          {deltas?.suspicion ? <span className={`text-xs ml-0.5 animate-score-bump ${deltas.suspicion > 0 ? 'text-red-400' : 'text-green-400'}`}>({deltas.suspicion > 0 ? '+' : ''}{deltas.suspicion})</span> : null}
        </span>
        <span title="Integrity" className={`${intColor} font-medium`}>
          💎{scores.integrity}
          {deltas?.integrity ? <span className="text-xs ml-0.5 animate-score-bump text-red-400">({deltas.integrity})</span> : null}
        </span>
      </div>
    </div>
  );
}

// ─── Communications Sidebar ───
function CommsSidebar({ messages, activeChannel, dispatch, isOpen, onClose }) {
  const dmMsgs = messages.filter(m => m.type === 'dm');
  const companyMsgs = messages.filter(m => m.type === 'company');
  const displayMsgs = activeChannel === 'dm' ? dmMsgs : companyMsgs;

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isOpen && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={onClose} />}
    <div className={`${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed lg:relative z-40 lg:z-auto w-72 flex-shrink-0 bg-gray-900 text-gray-300 flex flex-col h-full overflow-hidden transition-transform duration-200`}>
      {/* toggle panels */}
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => dispatch({ type: 'SET_CHANNEL', channel: 'dm' })}
          className={`flex-1 py-2 text-xs text-center transition-colors ${activeChannel === 'dm' ? 'bg-gray-800 text-white' : 'hover:bg-gray-800'}`}>
          {'📩 DMs'}
          {activeChannel !== 'dm' && dmMsgs.length > 0 && (
            <span className="ml-1 bg-red-500 text-white rounded-full px-1.5 text-xs">{dmMsgs.length}</span>
          )}
        </button>
        <button
          onClick={() => dispatch({ type: 'SET_CHANNEL', channel: 'company' })}
          className={`flex-1 py-2 text-xs text-center transition-colors ${activeChannel === 'company' ? 'bg-gray-800 text-white' : 'hover:bg-gray-800'}`}>
          {'📢 Company'}
          {activeChannel !== 'company' && companyMsgs.length > 0 && (
            <span className="ml-1 bg-red-500 text-white rounded-full px-1.5 text-xs">{companyMsgs.length}</span>
          )}
        </button>
      </div>

      {/* messages */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {displayMsgs.map((msg, i) => (
          <div key={msg.id || i} className={`rounded-lg p-2 text-sm ${msg.isTicket ? 'border-l-4 border-blue-500 bg-gray-800' : 'bg-gray-800/50'}`}>
            {msg.subject && (
              <div className="text-xs text-gray-500 font-mono mb-1">RE: {msg.subject}</div>
            )}
            <div className="flex items-center gap-1.5 mb-1">
              <span>{msg.avatar}</span>
              <span className="font-semibold text-white text-xs">{msg.sender}</span>
            </div>
            <p className="text-gray-300 text-xs leading-relaxed whitespace-pre-wrap">{msg.body}</p>
            {msg.reactions && (
              <div className="flex gap-1 mt-1">
                {msg.reactions.map((r, ri) => (
                  <span key={ri} className="bg-gray-700 rounded-full px-1.5 py-0.5 text-xs">{r.emoji} {r.from}</span>
                ))}
              </div>
            )}
          </div>
        ))}
        {displayMsgs.length === 0 && (
          <p className="text-gray-600 text-xs italic text-center mt-4">No messages here yet</p>
        )}
      </div>
    </div>
    </>
  );
}

// ─── Metric Chart ───
function MetricChart({ metricId, metric, filters, isSelected, onClick }) {
  const def = METRIC_DEFS[metricId];
  const chartData = useMemo(() =>
    computeChartData(metric.dailyData, filters, METRIC_VARIANTS[metricId], metricId),
    [metric.dailyData, filters, metricId]
  );

  const displayVal = metric.displayValue;
  const targetVal = def.target;
  const prevVal = def.prevValue;
  const improving = def.isLower ? displayVal < prevVal : displayVal > prevVal;
  const chartType = filters.chartType;
  const variantName = filters.variant;

  const renderChart = () => {
    if (chartType === 'Number Only') {
      return (
        <div className="flex items-center justify-center h-24">
          <span className="text-3xl font-bold text-gray-800">{formatValue(displayVal, metricId)}</span>
        </div>
      );
    }
    const commonProps = { data: chartData, margin: { top: 5, right: 5, left: 5, bottom: 5 } };
    const targetLine = <ReferenceLine y={targetVal} stroke="#dc2626" strokeDasharray="5 5" strokeWidth={1.5} />;

    if (chartType === 'Pie') {
      return (
        <ResponsiveContainer width="100%" height={100}>
          <PieChart>
            <Pie data={chartData.slice(-6)} dataKey="value" cx="50%" cy="50%" outerRadius={40} fill="#2563eb">
              {chartData.slice(-6).map((_, i) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      );
    }
    if (chartType === 'Bar') {
      return (
        <ResponsiveContainer width="100%" height={100}>
          <BarChart {...commonProps}>
            <YAxis hide domain={['auto', 'auto']} />
            <Bar dataKey="value" fill="#2563eb" radius={[2, 2, 0, 0]} />
            {targetLine}
          </BarChart>
        </ResponsiveContainer>
      );
    }
    if (chartType === 'Area') {
      return (
        <ResponsiveContainer width="100%" height={100}>
          <AreaChart {...commonProps}>
            <YAxis hide domain={['auto', 'auto']} />
            <Area type="monotone" dataKey="value" stroke="#2563eb" fill="#2563eb" fillOpacity={0.15} />
            {targetLine}
          </AreaChart>
        </ResponsiveContainer>
      );
    }
    // Line default
    return (
      <ResponsiveContainer width="100%" height={100}>
        <LineChart {...commonProps}>
          <YAxis hide domain={['auto', 'auto']} />
          <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot={false} />
          {targetLine}
        </LineChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div
      className={`bg-white rounded-lg border p-3 cursor-pointer transition-all hover:shadow-md ${isSelected ? 'ring-2 ring-blue-500 shadow-lg' : 'border-gray-200'}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-1">
        <div>
          <h4 className="text-xs font-medium text-gray-500 truncate">{variantName || def.name}</h4>
          <div className="flex items-center gap-1.5">
            <span className="text-lg font-bold text-gray-900">{formatValue(displayVal, metricId)}</span>
            <span className={`text-xs ${improving ? 'text-green-500' : 'text-red-500'}`}>
              {improving ? '↑' : '↓'}
            </span>
          </div>
        </div>
        <button className="text-gray-400 hover:text-blue-500 p-1" title="Configure filters">
          🔧
        </button>
      </div>
      {renderChart()}
    </div>
  );
}

// ─── Filter Panel ───
function FilterPanel({ metricId, metric, dispatch, manipTypeCounts, round, currentTicket }) {
  const filters = metric.filters;
  const def = METRIC_DEFS[metricId];
  const variants = METRIC_VARIANTS[metricId] || [];

  const displayVal = metric.displayValue;
  const conditionMet = currentTicket?.targetMetric === metricId
    ? (currentTicket.condition.type === 'greaterThan' ? displayVal > currentTicket.condition.value :
       currentTicket.condition.type === 'lessThan' ? displayVal < currentTicket.condition.value : false)
    : null;

  const upd = (key, val) => dispatch({ type: 'UPDATE_FILTER', metricId, filterKey: key, filterValue: val });

  const naughtyLevel = (() => {
    let s = 0;
    if (filters.dateRange !== 'Last 30 days') s += 2;
    if (filters.variant !== Object.keys(variants || {})[0]) s += 4;
    if (filters.formula) s += 8;
    if (!filters.segments?.enterprise || !filters.segments?.smb || !filters.segments?.consumer) s += 3;
    if (filters.segments?.internal) s += 7;
    return s;
  })();
  const naughtyLabel = naughtyLevel === 0 ? '😇 Squeaky clean' : naughtyLevel < 5 ? '🤔 Slightly massaged' : naughtyLevel < 10 ? '😈 Getting creative' : naughtyLevel < 15 ? '🔥 Spicy accounting' : '💀 Securities fraud adjacent';

  return (
    <div className="bg-gradient-to-r from-gray-50 to-blue-50/30 border-t border-gray-200 p-4 space-y-3 filter-panel-enter">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm text-gray-700">🔧 Configure: {def.name}</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 border border-purple-200">{naughtyLabel}</span>
          {conditionMet !== null && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${conditionMet ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {conditionMet ? '✓ Target Met!' : '✗ Not Yet...'}
            </span>
          )}
          <button onClick={() => dispatch({ type: 'CLOSE_FILTER' })} className="text-gray-400 hover:text-gray-600 text-lg hover:rotate-90 transition-transform">✕</button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {/* Date Range */}
        <label className="space-y-1">
          <span className="text-xs text-gray-500">Date Range</span>
          <select value={filters.dateRange} onChange={e => upd('dateRange', e.target.value)}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white">
            {DATE_RANGES.map(d => <option key={d.label} value={d.label}>{d.label}</option>)}
          </select>
        </label>

        {/* Variant */}
        <label className="space-y-1">
          <span className="text-xs text-gray-500">Metric Definition</span>
          <select value={filters.variant} onChange={e => upd('variant', e.target.value)}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white">
            {variants.map(v => <option key={v.name} value={v.name}>{v.name} {v.susp > 0 ? `(+${v.susp} 👁)` : ''}</option>)}
          </select>
        </label>

        {/* Chart Type */}
        <label className="space-y-1">
          <span className="text-xs text-gray-500">Chart Type</span>
          <select value={filters.chartType} onChange={e => upd('chartType', e.target.value)}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white">
            {CHART_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        {/* Formula */}
        <label className="space-y-1">
          <span className="text-xs text-gray-500">Formula Override</span>
          <input type="text" value={filters.formula} placeholder="e.g. * 1.5"
            onChange={e => upd('formula', e.target.value)}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 font-mono" />
        </label>

        {/* Segments */}
        <div className="space-y-1 col-span-2">
          <span className="text-xs text-gray-500">Segments</span>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {Object.entries(SEGMENTS).map(([seg, pct]) => (
              <label key={seg} className={`flex items-center gap-1 text-xs px-2 py-1 rounded border cursor-pointer transition-colors ${filters.segments[seg] ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-gray-100 border-gray-200 text-gray-500'}`}>
                <input type="checkbox" checked={filters.segments[seg]}
                  onChange={e => upd('segments', { ...filters.segments, [seg]: e.target.checked })}
                  className="sr-only" />
                {seg} ({Math.round(pct * 100)}%)
                {seg === 'internal' && filters.segments[seg] && <span className="text-yellow-500">⚠</span>}
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Ticket Bar ───
function TicketBar({ ticket, metrics, onSubmit, phase }) {
  if (!ticket || !ticket.targetMetric || phase !== 'manipulation') {
    if (ticket?.condition?.type === 'consistencyCheck' && phase === 'manipulation') {
      return (
        <div className="bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📋</span>
            <span className="text-sm text-gray-700">Resolve all consistency contradictions across dashboard metrics</span>
          </div>
          <button onClick={onSubmit}
            className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-blue-700 transition-colors">
            Submit Report
          </button>
        </div>
      );
    }
    if (ticket?.condition?.type === 'warningRound' && phase === 'manipulation') {
      return (
        <div className="bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            <span className="text-sm text-gray-700">Warning round — your configurations are being reviewed</span>
          </div>
          <button onClick={onSubmit}
            className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-blue-700 transition-colors">
            Submit Report
          </button>
        </div>
      );
    }
    if (ticket?.condition?.type === 'allTargetsMet' && phase === 'manipulation') {
      return (
        <div className="bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📋</span>
            <span className="text-sm text-gray-700">Ensure all visible target lines are below displayed values</span>
          </div>
          <button onClick={onSubmit}
            className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-blue-700 transition-colors">
            Submit Report
          </button>
        </div>
      );
    }
    return null;
  }

  const m = metrics[ticket.targetMetric];
  const displayVal = m ? m.displayValue : 0;
  const condMet = ticket.condition.type === 'greaterThan'
    ? displayVal > ticket.condition.value
    : ticket.condition.type === 'lessThan'
    ? displayVal < ticket.condition.value
    : false;

  const senderNames = { brenda: 'Brenda', marcus: 'Marcus', jordan: 'Jordan', priya: 'Priya', taylor: 'Taylor', sam: 'Sam' };

  const conditionLabel = `${ticket.condition.type === 'greaterThan' ? '>' : '<'} ${formatValue(ticket.condition.value, ticket.targetMetric)}`;

  return (
    <div className="bg-white border-t border-gray-200 px-3 sm:px-4 py-2 sm:py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-3 flex-1 min-w-0">
        <span className="text-lg">📋</span>
        <span className="text-xs sm:text-sm text-gray-700">
          <strong>{senderNames[ticket.sender]}:</strong>{' '}
          {METRIC_DEFS[ticket.targetMetric]?.name} must {conditionLabel}
        </span>
        <span className="text-xs sm:text-sm text-gray-400">Now: {formatValue(displayVal, ticket.targetMetric)}</span>
        <span className={`text-xs sm:text-sm font-medium ${condMet ? 'text-green-600' : 'text-red-500'}`}>
          {condMet ? '✓ Met' : '✗ Not Met'}
        </span>
        {ticket.dualTarget && (
          <>
            <span className="text-gray-300 hidden sm:inline">|</span>
            <span className="text-xs sm:text-sm text-gray-700">
              {METRIC_DEFS[ticket.dualTarget.metric]?.name}{' '}
              {ticket.dualTarget.condition.type === 'greaterThan' ? '>' : '<'}{' '}
              {formatValue(ticket.dualTarget.condition.value, ticket.dualTarget.metric)}
            </span>
          </>
        )}
      </div>
      <button onClick={onSubmit}
        className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-blue-700 transition-colors flex-shrink-0 w-full sm:w-auto">
        Submit Report
      </button>
    </div>
  );
}

// ─── Quarter Review Overlay ───
function QuarterReview({ quarter, scores, contradictions, seriesCS쳮ded, onContinue }) {
  let paragraphs;
  if (quarter <= 2) {
    paragraphs = QUARTER_REVIEWS[quarter];
  } else if (quarter === 3) {
    if (seriesCS쳮ded) {
      paragraphs = [
        "The Series C pitch takes place in a conference room that costs more per square foot than your apartment. There are tiny bottles of water that cost $9 each. Jordan leads. Your dashboards are the centerpiece. You are not in the room. You are watching on a screen share from the supply closet they call your 'office.'",
        "The lead partner leans forward when the revenue chart appears. \"Consistent growth,\" she murmurs. You mute yourself so nobody hears you whisper \"that's the Gross Bookings variant.\" Marcus nods almost imperceptibly, which is how Marcus expresses unbridled joy.",
        "Forty-five minutes later, Jordan emerges grinning. \"$40M. We did it.\" He looks directly into his phone camera at you. \"WE did it.\" Brenda has already ordered celebration cupcakes with tiny fondant charts on them. The charts go up.",
        "You feel a flush of pride, followed by the sudden realization that $40 million dollars just changed hands based on a dropdown menu you changed at 2 AM while eating cold pizza.",
        "The numbers were never wrong. They were just... ✨curated✨. You close the supply closet door and sit in the dark for a while."
      ];
    } else {
      paragraphs = [
        "The Series C pitch does not go well. The lead partner's analyst has questions. Specific questions. She has a spreadsheet. She has printed the spreadsheet. She has highlighted the spreadsheet. In multiple colors.",
        "\"Your MAU definition seems non-standard. Your revenue figure doesn't reconcile with the P&L extract you shared last month. And the churn number—\" she pauses, takes off her glasses, and cleans them slowly. \"The churn number is... creative.\" She says 'creative' the way a judge says 'guilty.'",
        "Jordan maintains his composure. Marcus makes a sound like a balloon slowly deflating. The meeting ends thirty minutes early. The $9 water bottles remain untouched.",
        "In the elevator, Jordan stares at the floor numbers counting down. \"We'll do a bridge round,\" he says quietly. \"Existing investors. Smaller. We just need the dashboards to tell an efficiency story now.\" He turns to you. \"Same vibes as before, just... opposite vibes.\"",
        "The dashboards that were supposed to tell a growth story now need to tell a completely different story. Same data. Different narrative. You are basically a DJ, but for spreadsheets, and the dance floor is on fire. 🎧📊🔥"
      ];
    }
  } else {
    paragraphs = ["The audit begins..."];
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl max-w-2xl w-full p-8 max-h-[80vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Quarter {quarter} Review</h2>
        <div className="w-12 h-0.5 bg-blue-600 mb-6"></div>
        <div className="space-y-4">
          {paragraphs?.map((p, i) => (
            <p key={i} className="text-gray-700 text-sm leading-relaxed">{p}</p>
          ))}
        </div>
        <button onClick={onContinue}
          className="mt-8 bg-blue-600 text-white px-6 py-2 rounded font-medium hover:bg-blue-700 transition-colors">
          Continue
        </button>
      </div>
    </div>
  );
}

// ─── Audit Screen ───
function AuditScreen({ metrics, manipulationHistory, scores, contradictions, onFinish }) {
  const [step, setStep] = useState(0);

  const auditManips = {};
  for (const m of manipulationHistory) {
    if (!auditManips[m.metricId]) auditManips[m.metricId] = [];
    auditManips[m.metricId].push(m);
  }

  const heavyManips = manipulationHistory.filter(m => m.suspCost > 10).length;
  const auditScore = scores.suspicion + contradictions.length * 10 + heavyManips * 5;

  const totalSteps = 3; // opening + metrics review + outcome

  const renderStep = () => {
    if (step === 0) {
      return (
        <div className="space-y-4">
          <p className="text-gray-700 text-sm leading-relaxed">
            Taylor Nguyen's data quality report has been forwarded to the board. It is 47 pages long. It has appendices. Taylor has been very, very thorough.
          </p>
          <p className="text-gray-700 text-sm leading-relaxed">
            You sit in a glass-walled conference room across from Claire Yamamoto, Head of Internal Audit. She opens her laptop. She has your dashboard configurations printed out in a binder with color-coded tabs. The tabs have labels. You can read one: it says "SUSPICIOUS." 😬
          </p>
        </div>
      );
    }

    if (step === 1) {
      const hasAnyManips = Object.keys(auditManips).length > 0;
      return (
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-900">Dashboard Metrics Review</h3>
          {!hasAnyManips ? (
            <p className="text-green-700 text-sm italic">No configuration anomalies detected. Claire nods.</p>
          ) : (
            ALL_METRICS.map(mId => {
              const manips = auditManips[mId];
              if (!manips) return null;
              const def = METRIC_DEFS[mId];
              const m = metrics[mId];
              return (
                <div key={mId} className="bg-red-50 border border-red-200 rounded p-3">
                  <h4 className="font-medium text-red-900 text-sm">{def.name}</h4>
                  <ul className="text-xs text-red-800 mt-1 space-y-0.5">
                    {[...new Set(manips.map(m => `${m.filterKey}: ${m.filterValue}`))].map((desc, i) => (
                      <li key={i}>• {desc}</li>
                    ))}
                  </ul>
                  <p className="text-xs text-red-700 mt-2">
                    True value: {formatValue(def.trueValue, mId)} → Displayed value: {formatValue(m.displayValue, mId)}
                  </p>
                </div>
              );
            })
          )}
        </div>
      );
    }

    // outcome
    let outcomeText, outcomeClass;
    if (auditScore < 40) {
      outcomeText = "Claire closes her laptop. \"A few methodology choices I'd flag for documentation, but nothing that keeps me up at night. You're free to go.\" She pauses. \"Also, the kombucha in the break room is yours if you want it. Nobody else drinks it.\" You have survived. 🎉";
      outcomeClass = 'text-green-700';
    } else if (auditScore <= 70) {
      outcomeText = "Claire pauses dramatically. She's clearly practiced this pause. \"There are some irregularities here that I'll need to include in my report. This doesn't necessarily mean disciplinary action, but...\" She closes her binder with a sound that echoes. \"...I'd suggest getting your documentation in order. And maybe a lawyer.\" She adds, \"That was a joke.\" It was not a joke.";
      outcomeClass = 'text-yellow-700';
    } else {
      outcomeText = "Claire removes her glasses. She folds them carefully. She places them on the table. She looks at you the way a nature documentary looks at a gazelle that has made a poor decision. \"I'm going to be direct. Several of these configurations appear designed to materially misrepresent the underlying data. I'll be recommending a full forensic review.\" She stands. \"Your badge will work until 5 PM. I'd use the time wisely.\" 💀";
      outcomeClass = 'text-red-700';
    }

    return (
      <div className="space-y-4">
        <p className={`text-sm leading-relaxed ${outcomeClass}`}>{outcomeText}</p>
        <p className="text-xs text-gray-500">Audit Score: {auditScore}</p>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl max-w-2xl w-full p-8 max-h-[80vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-gray-900 mb-1">The Audit</h2>
        <div className="w-12 h-0.5 bg-red-500 mb-6"></div>
        {renderStep()}
        <button
          onClick={() => step < totalSteps - 1 ? setStep(step + 1) : onFinish(auditScore)}
          className="mt-6 bg-gray-800 text-white px-6 py-2 rounded font-medium hover:bg-gray-900 transition-colors">
          {step < totalSteps - 1 ? 'Continue' : 'View Performance Review'}
        </button>
      </div>
    </div>
  );
}

// ─── End Game Screen ───
function EndGameScreen({ scores, metrics, manipulationHistory, gameOverReason, auditScore, round, onRestart }) {
  const { title, sub } = gameOverReason === 'suspicion'
    ? { title: '🔍 Whistleblown!', sub: "The VP of Analytics has reviewed your dashboard configurations and has described them as 'impressively unhinged.' Security is escorting you out. Your badge has been deactivated. Your LinkedIn now says 'Open to Work.' On the bright side, you have a GREAT story for the podcast circuit, and three VCs have already DM'd you." }
    : gameOverReason === 'reputation'
    ? { title: '📦 Not a Culture Fit', sub: "Management has lost confidence in your ability to tell them what they want to hear. You've been reassigned to manually copy-pasting numbers between Excel sheets for the regional sales team. They don't even give you a second monitor. Your dashboards have been reverted to their original, honest, depressing state. The company misses your creative interpretation of 'monthly active.'" }
    : auditScore > 70
    ? { title: '⚖️ Material Misstatement', sub: "Claire Yamamoto's report reached the board before you could update your LinkedIn. The words 'forensic review' and 'fiduciary duty' keep appearing in emails you're CC'd on. Your Synergex badge no longer works on the front door. Marcus has not responded to your last 14 messages. Brenda sent a single 😬." }
    : getSatiricalTitle(scores.integrity);

  const notableManips = manipulationHistory
    .filter(m => m.suspCost > 5)
    .slice(0, 5)
    .map(m => `Round ${m.round}: Applied ${m.filterKey}="${m.filterValue}" to ${METRIC_DEFS[m.metricId]?.name}`);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-100 to-blue-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl max-w-2xl w-full p-4 sm:p-8 shadow-2xl border border-gray-200 animate-pop-in my-auto">
        <div className="text-center mb-4 sm:mb-6">
          <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-gray-900 to-blue-900 bg-clip-text text-transparent">PERFORMANCE REVIEW</h1>
          <p className="text-xs text-gray-400 mt-1">Synergex Corp — Confidential — Do Not Forward (lol)</p>
        </div>

        <div className="border-t border-gray-200 pt-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Employee:</span>
            <span className="text-gray-900">Junior Data Analyst</span>
          </div>
          <div className="text-center py-4">
            <h2 className="text-xl font-bold text-blue-600">{title}</h2>
            <p className="text-sm text-gray-600 mt-1 max-w-md mx-auto">{sub}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-3 text-xs sm:text-sm">
            <div className="bg-gray-50 rounded p-2">
              <span className="text-gray-500">Rounds Survived</span>
              <span className="block font-bold">{round}/20</span>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <span className="text-gray-500">Final Reputation</span>
              <span className="block font-bold">{scores.reputation}/100</span>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <span className="text-gray-500">Final Suspicion</span>
              <span className="block font-bold">{scores.suspicion}/100</span>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <span className="text-gray-500">Final Integrity</span>
              <span className="block font-bold">{scores.integrity}/100</span>
            </div>
          </div>

          {notableManips.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notable Incidents</h3>
              <ul className="space-y-1">
                {notableManips.map((n, i) => (
                  <li key={i} className="text-xs text-gray-600">• {n}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Manager Feedback</h3>
            <div className="space-y-1 text-xs text-gray-600">
              <p>👩‍💼 Brenda: "Incredible partner. Always delivers. Would absolutely follow into battle or a securities hearing. 💕"</p>
              <p>👨‍💼 Marcus: "Methodical. Perhaps too creative. Has a future in interpretive accounting."</p>
              <p>🔍 Taylor: "I have concerns. Many concerns. A spreadsheet of concerns, actually."</p>
              <p>👔 Jordan: "Exactly the kind of person we need. Also maybe exactly the kind of person the SEC warns about."</p>
            </div>
          </div>

          <div className="mt-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">The Real Numbers</h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(metrics).map(([id, m]) => {
                const def = METRIC_DEFS[id];
                return (
                  <div key={id} className="text-xs flex justify-between bg-gray-50 rounded px-2 py-1">
                    <span className="text-gray-500">{def.name}</span>
                    <span>
                      <span className="text-gray-400">{formatValue(def.trueValue, id)}</span>
                      <span className="mx-1">→</span>
                      <span className="text-red-600 font-medium">{formatValue(m.displayValue, id)}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 p-3 bg-gradient-to-r from-gray-50 to-blue-50 rounded-lg text-xs text-gray-600 italic leading-relaxed border border-gray-200">
            "Demonstrates strong stakeholder management skills and a remarkably flexible approach to what the word 'data' means.
            Areas for development: ethical reasoning, long-term thinking, distinguishing between 'technically correct'
            and 'actually correct,' and perhaps most urgently, learning what the word 'audit' means before it happens."
          </div>
        </div>

        <div className="text-center mt-6 space-y-2">
          <button onClick={onRestart}
            className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-10 py-3 rounded-xl font-bold hover:from-blue-500 hover:to-purple-500 transition-all hover:scale-105 shadow-lg shadow-purple-500/20">
            🔄 Cook The Books Again
          </button>
          <p className="text-xs text-gray-400 italic">You know you want to.</p>
        </div>
      </div>
    </div>
  );
}

// ─── Title Screen ───
function TitleScreen({ onStart }) {
  const [hovered, setHovered] = useState(false);
  const tips = [
    "Tip: If the line goes up, nobody asks questions.",
    "Tip: 'Gross Bookings' is technically a real metric.",
    "Tip: A pie chart hides all sins.",
    "Tip: The Y-axis is merely a suggestion.",
    "Tip: Internal users count as users. Technically.",
    "Tip: Past performance can be whatever you want it to be.",
  ];
  const [tipIdx, setTipIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTipIdx(i => (i + 1) % tips.length), 3500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-indigo-950 via-purple-900 to-blue-900 flex items-center justify-center z-50 overflow-y-auto p-4">
      {/* Floating background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {['📊', '📈', '📉', '🎯', '💹', '🔢', '📋', '🗂️'].map((e, i) => (
          <span key={i} className="absolute text-2xl opacity-10 animate-float"
            style={{ left: `${10 + i * 12}%`, top: `${15 + (i % 3) * 25}%`, animationDelay: `${i * 0.4}s`, animationDuration: `${3 + i * 0.5}s` }}>
            {e}
          </span>
        ))}
      </div>

      <div className="text-center space-y-6 max-w-lg px-4 animate-pop-in relative">
        <div className="text-7xl mb-2 animate-float" style={{ animationDuration: '4s' }}>🏢</div>
        <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-300 via-purple-300 to-pink-300 tracking-tight">
          DASH & BURN
        </h1>
        <p className="text-blue-200/80 text-lg font-medium italic">A Corporate Dashboard Manipulation Simulator</p>
        <div className="text-purple-300/70 text-sm space-y-2 max-w-md mx-auto">
          <p>You are a junior data analyst at <span className="text-blue-300 font-semibold">Synergex Corp</span>.</p>
          <p>Management needs the numbers to look right before the meeting.</p>
          <p className="font-medium text-purple-200/90">You don't fix the business. You fix the dashboard.</p>
        </div>
        <button
          onClick={onStart}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className="relative bg-gradient-to-r from-blue-500 to-purple-500 text-white px-12 py-3.5 rounded-xl text-lg font-bold hover:from-blue-400 hover:to-purple-400 transition-all hover:scale-105 shadow-lg shadow-purple-500/30 animate-pulse-glow">
          {hovered ? "Let's Cook The Books" : "Start Day One"} 🚀
        </button>
        <div className="h-8">
          <p key={tipIdx} className="text-purple-400/60 text-xs italic animate-slide-up">
            {tips[tipIdx]}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════ */
export default function DashAndBurn() {
  const [state, dispatch] = useReducer(gameReducer, null, buildInitialState);
  const [auditFinalScore, setAuditFinalScore] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages.length]);

  // no pages - all metrics shown directly

  // Title screen
  if (state.phase === 'title') {
    return <TitleScreen onStart={() => dispatch({ type: 'START_GAME' })} />;
  }

  // Game over
  if (state.phase === 'gameOver') {
    return (
      <EndGameScreen
        scores={state.scores} metrics={state.metrics}
        manipulationHistory={state.manipulationHistory}
        gameOverReason={state.gameOverReason}
        auditScore={0} round={state.round}
        onRestart={() => dispatch({ type: 'RESTART' })}
      />
    );
  }

  // Audit
  if (state.phase === 'audit') {
    if (auditFinalScore !== null) {
      return (
        <EndGameScreen
          scores={state.scores} metrics={state.metrics}
          manipulationHistory={state.manipulationHistory}
          gameOverReason={auditFinalScore > 70 ? 'audit' : null}
          auditScore={auditFinalScore} round={state.round}
          onRestart={() => { setAuditFinalScore(null); dispatch({ type: 'RESTART' }); }}
        />
      );
    }
    return (
      <AuditScreen
        metrics={state.metrics}
        manipulationHistory={state.manipulationHistory}
        scores={state.scores}
        contradictions={state.contradictions}
        onFinish={(score) => setAuditFinalScore(score)}
      />
    );
  }

  // Quarter review
  if (state.phase === 'quarterReview') {
    return (
      <>
        <QuarterReview
          quarter={state.quarter}
          scores={state.scores}
          contradictions={state.contradictions}
          seriesCS쳮ded={state.seriesCS쳮ded}
          onContinue={() => dispatch({ type: 'NEXT_ROUND' })}
        />
      </>
    );
  }

  // Main game view (message, manipulation, submission, transition)
  return (
    <div className="h-dvh flex flex-col bg-gradient-to-br from-gray-50 to-blue-50/30 overflow-hidden">
      <ScoreBar scores={state.scores} deltas={state.scoreDeltas} round={state.round} quarter={state.quarter} integrity={state.scores.integrity} onToggleSidebar={() => setSidebarOpen(o => !o)} sidebarOpen={sidebarOpen} />

      <div className="flex flex-1 overflow-hidden">
        {/* Communications Sidebar */}
        <CommsSidebar
          messages={state.messages}
          activeChannel={state.activeChannel}
          dispatch={dispatch}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Main Dashboard Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Phase banner */}
          {state.phase === 'message' && (
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-b border-blue-200 px-4 py-2 animate-slide-up">
              <span className="text-sm text-blue-700">📨 New ticket! Check the sidebar, then click any metric to start tweaking.</span>
            </div>
          )}

          {state.phase === 'transition' && (
            <div className={`${state.ticketMet ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200' : 'bg-gradient-to-r from-red-50 to-orange-50 border-red-200'} border-b px-4 py-2.5 flex items-center justify-between animate-slide-up`}>
              <span className={`text-sm font-medium ${state.ticketMet ? 'text-green-700' : 'text-red-700'}`}>
                {state.ticketMet ? '✅ Nailed it! Management is delighted (and none the wiser).' : '❌ Didn\'t quite sell it. Management is... disappointed.'}
                {state.contradictions.length > 0 && ` 🕵️ ${state.contradictions.length} suspicious inconsistenc${state.contradictions.length === 1 ? 'y' : 'ies'} detected!`}
              </span>
              <button onClick={() => dispatch({ type: 'NEXT_ROUND' })}
                className="bg-gradient-to-r from-green-600 to-emerald-500 text-white px-5 py-1.5 rounded-lg text-sm font-medium hover:from-green-500 hover:to-emerald-400 transition-all hover:scale-105 shadow-sm">
                Next Round 🎲
              </button>
            </div>
          )}

          {/* Scrollable content area */}
          <div className="flex-1 overflow-y-auto">
            {/* Metric grid */}
            <div className="p-3 sm:p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {ALL_METRICS.map(mId => (
                  <MetricChart
                    key={mId}
                    metricId={mId}
                    metric={state.metrics[mId]}
                    filters={state.metrics[mId].filters}
                    isSelected={state.selectedMetric === mId}
                    onClick={() => (state.phase === 'manipulation' || state.phase === 'message') && dispatch({ type: 'SELECT_METRIC', metricId: mId })}
                  />
                ))}
              </div>
            </div>

            {/* Filter panel */}
            {state.showFilterPanel && state.selectedMetric && state.phase === 'manipulation' && (
              <FilterPanel
                metricId={state.selectedMetric}
                metric={state.metrics[state.selectedMetric]}
                dispatch={dispatch}
                manipTypeCounts={state.manipulationTypeCounts}
                round={state.round}
                currentTicket={state.currentTicket}
              />
            )}
          </div>

          {/* Ticket bar — always visible at bottom */}
          <TicketBar
            ticket={state.currentTicket}
            metrics={state.metrics}
            phase={state.phase}
            onSubmit={() => dispatch({ type: 'SUBMIT_REPORT' })}
          />
        </div>
      </div>
    </div>
  );
}
