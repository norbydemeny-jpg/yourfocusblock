/* ══════════════════════════════════════════════════════
   FocusBlock — state.js
   Global state, constants, and pure helpers.
   NO DOM writes, NO side effects on load.
   ══════════════════════════════════════════════════════ */

/* ---- storage keys ---- */
const LS_KEY = 'focusblock_v2';
const DB_NAME = 'focusblock_db', DB_STORE = 'kv';

/* ---- persistent state ---- */
let S = {
  focus:50, short:10, long:25, longAfter:4,
  theme:'lime', light:false, sound:'soft', tips:true,
  lang:'en', bgPhoto:'', ambient:'none',
  timerLayout:'ring', animLevel:'balanced',
  companion:'plant', companionName:'', companionVis:'focus',
  companionTone:'friendly', companionSound:'off'
};
let userName = '';
let subjects = [];            // master subject list [{name,color}]
let streak = 0, lastDay = null;
let lifetimeBlocks = 0, lifetimeMins = 0, lifetimeFocusPoints = 0, houseProgress = 0;
let history = [];             // [{date, blocks, mins, subjects:{name:mins}}]
let subjectTotals = {};       // {name: minutes} lifetime
let lastPlan = null;          // {focus,short,long,longAfter,blocks:[{subject,mins,note,tasks}]}
let onboarded = false;
let _t = {};                  // settings draft

/* ---- session/runtime state ---- */
let blocks = [];              // active day blocks
let nid = 1, curPhase = 'focus', curBlock = 0;
let timeLeft = 0, totalTime = 0, running = false, iv = null;
let endTimestamp = 0;         // real wall-clock end (background-safe)
let sessComp = 0;             // completed focus sessions today
let completedMins = 0;        // minutes from FINISHED focus blocks
let currentSessionMins = 0;   // minutes elapsed in the running focus block
let dayCounted = false;
let needsComeback = false;
let audioCtx = null;
let flowMode = null;          // 'onboard' | 'quick'(skips) | 'plan' | 'short' | 'edit-settings'
let flowStep = 0, flowSteps = [];
let progReturn = 'home';      // where to return from progress

/* draft used during flow */
let D = {};

/* ---- agenda state ---- */
let examDates = []; // [{id,date:'YYYY-MM-DD',subject,note,color}]
let dayPlans = {};  // {'YYYY-MM-DD': copied D.bb array}
let agendaViewDate = null; // currently shown month as Date

/* ---- planner state ---- */
let plannerStartTime = '';   // "HH:MM" — start time shown in day planner
let plannerEndTime = '';     // "HH:MM" — optional end-time target
let _editingBlockIdx = -1;   // which block is open in block-detail modal
let plannerMode = 'full';    // 'full' | 'quick' — quick hides start/end time row
let _planningForDate = null; // set when opening planner from agenda to save plan back

/* ---- palette for subject dots ---- */
const SUBJ_COLORS = ['#c8f060','#fb7185','#67e8f9','#fcd34d','#c084fc','#6ee7b7','#f0a868','#a3e635','#38bdf8','#f472b6'];
function colorFor(name){
  const s = subjects.find(x => x.name === name);
  if(s && s.color) return s.color;
  let h = 0;
  for(let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return SUBJ_COLORS[Math.abs(h) % SUBJ_COLORS.length];
}

/* ---- date helpers ---- */
function todayStr(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
// Study-day boundary: 4am. So sessions that run past midnight still count as "the same day" until 04:00.
function studyDayStr(){
  const d = new Date(Date.now() - 4*3600*1000);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function daysBetween(a, b){ return Math.round((new Date(b) - new Date(a)) / 86400000); }
function fmt(s){ s = Math.max(0, Math.round(s)); const m = Math.floor(s/60), sec = s%60; return String(m).padStart(2,'0') + ':' + String(sec).padStart(2,'0'); }
function fmtClock(d){ return d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12:false}); }
function fmtDur(m){ m = Math.round(m); const h = Math.floor(m/60), mn = m%60; return mn ? (h ? h+'h '+mn+'m' : mn+'m') : (h ? h+'h' : '0m'); }
function esc(s){ const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
function getCSS(v){ return getComputedStyle(document.body).getPropertyValue(v).trim(); }

/* ══════════════════════════════════════════════════════
   TRANSLATIONS
   ══════════════════════════════════════════════════════ */
const LANGS = [{id:'en',n:'English'},{id:'nl',n:'Nederlands'},{id:'fr',n:'Français'},{id:'es',n:'Español'},{id:'ro',n:'Română'}];
const TR = {
en:{
 back:"Back",next:"Next",continue:"Continue",done:"Done",cancel:"Cancel",save:"Save",add:"Add",skip:"Skip",
 home_greet_new:"Welcome",home_greet:"Welcome back, {name}",
 home_title_new:"Plan your day.<br><em>Own your focus.</em>",home_title:"Hi {name}.<br><em>Ready to focus?</em>",
 home_sub:"Pick how you want to start. You don't have to study all day — just a few focused blocks, done well.",
 home_foot:"Your progress is saved on this device only. No account, no server.",
 home_empty_t:"Ready to start?",home_empty_d:"Choose how you want to begin below. <em>Quick start</em> works immediately — no setup needed.",
 card_quick_t:"Quick start",card_quick_d:"Jump straight into a focus block. No setup.",card_quick_tag:"Fastest",
 card_plan_t:"Plan my day",card_plan_d:"Build a full plan: pick subjects, times and order.",card_plan_tag:"Most control",
 card_short_t:"Short on time",card_short_d:"Tell me your subjects and how long you have. I'll build a quick plan.",card_short_tag:"Smart",
 card_last_t:"Continue last plan",card_last_d:"Pick up exactly where you left off.",card_last_tag:"",
 onb_lang_q:"Choose your <span>language</span>",
 onb_name_q:"First — what's your <span>name</span>?",name_ph:"Your name…",
 onb_subj_q:"Which <span>subjects</span> are you studying?",onb_subj_hint:"Add the subjects you work on. You'll pick from these later — and can still type new ones anytime.",subj_ph:"e.g. Maths, French, Biology…",
 onb_comp_q:"Pick a <span>focus companion</span>",onb_comp_hint:"A quiet companion that reacts to your focus. Purely optional — it stays subtle.",
 onb_theme_q:"Pick your <span>look</span>",onb_theme_hint:"You can change this anytime in settings.",
 dur_q:"How do you want to <span>study</span> today?",dur_hint:"Pick a rhythm that fits your task — short for reviewing, longer for understanding or writing.",
 count_q:"How many <span>sessions</span> today?",count_hint:"You don't need many. A handful of focused blocks beats a whole distracted day.",
 sess_unit:"sessions",
 assign_q:"What's the <span>plan</span> for each session?",assign_hint:"Pick a subject per block, set the minutes, add tasks if you like.",
 short_subj_q:"What do you need to <span>get through</span>?",short_subj_hint:"Pick or add the subjects for today.",
 short_custom:"Custom",hours_short:"h",min_short:"min",short_time_q:"How much <span>time</span> do you have?",short_time_hint:"I'll fit your subjects into focus blocks with breaks.",
 minutes:"minutes",hours:"hours",
 ready_q:"Your <span>plan</span> is ready",
 ready_dur:"Session length",ready_blocks:"Sessions today",ready_total:"Total focus",ready_subj:"Subjects",rec_badge:"Recommended",
 begin:"Begin session",
 pick_subject:"Pick a subject",custom_subject:"Type your own…",no_subjects:"No subjects yet — add some above.",
 add_task:"+ Add task",task_ph:"Small task…",note_ph:"What exactly will you do?",note_lbl:"Note",
 // focus screen
 now:"Now",phase_focus:"Focus",phase_short:"Short break",phase_long:"Long break",
 ptab_focus:"Focus",ptab_short:"Short break",ptab_long:"Long break",
 ends_at:"Ends at",ep_start:"start the timer",ep_focus:"session ends",ep_break:"break ends",
 restart:"Restart",skip_btn:"Skip",
 today_sessions:"Today's sessions",add_session:"+ Add session",
 session_n:"Session {n}",break_word:"break",
 sess_of:"Session {a} of {b}",
 db_done:"{n} done",db_focused:"{m} focused",
 break_short_msg:"Take a breath.",break_long_msg:"Step away. You earned it.",
 // motivational (focus)
 m_ready:"One block at a time.",m_started:"Started. That's the hard part.",m_quarter:"Momentum building.",m_half:"Halfway. Keep the line.",m_three:"Almost there — don't break it.",m_near:"Finish this block strong.",
 // pause modal
 pause_t:"Even pauzeren?",pause_msg:"You're {min} minutes in. {left} more and this block counts fully.",
 pause_t_en:"Pause already?",pause_continue:"Keep going",pause_pause:"Pause anyway",
 // skip modal
 skip_t:"Skip this session?",skip_msg:"This won't count toward your sessions, streak or build. You're closer than you think.",
 skip_continue:"Keep going",skip_confirm:"Skip anyway",
 // leave warning
 leave_warn:"You have a focus session running. Leave anyway?",
 // reward
 reward_cheer:"Well done.",reward_sub:"You focused for {min} minutes.",
 reward_block:"+1 build block",reward_points:"+{n} focus points",reward_build:"Your build is {pct}% there.",
 reward_streak:"Day streak",reward_done:"Sessions done",reward_focus:"Focused",
 reward_reflect:"How did it go?",
 reflect_well:"Went well",reflect_partial:"Partially",reflect_struggled:"Struggled",
 reward_next:"Next: {name}",reward_continue:"Continue",reward_break_now:"Take your break",
 // recap
 recap_t:"That's a day.",recap_sub:"Every session done. Real, focused work.",
 recap_blocks:"{n} focus blocks",recap_time:"{t} studied",recap_subj:"Studied: {list}",
 recap_tomorrow:"Tomorrow",recap_tom_msg:"Start with {name} — keep the momentum going.",
 recap_close:"Done for today",
 // progress
 prog_title:"Your progress",prog_back:"Back",
 prog_lifetime:"Lifetime",lt_blocks:"Total sessions",lt_focus:"Total focus",lt_streak:"Day streak",
 prog_week:"This week",prog_subjects:"Time per subject",prog_village:"Your study village",prog_companion:"Your companion",
 village_next:"<b>{n}</b> more session{s} until {name}",village_max:"You've built it all. Keep growing your village.",
 comp_lvl:"Level {n}",comp_grown:"Grown through {n} focus sessions.",comp_unnamed:"Your companion",
 no_subj_data:"Finish some focus sessions to see your subject breakdown.",
 // settings
 set_title:"Settings",settings_saved:"Settings saved",
 tab_timer:"Timer",tab_appear:"Design",tab_comp:"Companion",tab_subjects:"Subjects",tab_lang:"Language",tab_data:"Data",
 set_subj_l:"My subjects",set_subj_s:"Add, rename or remove subjects — click a name to rename it.",
 subj_rename_tip:"Click to rename",
 set_focus_l:"Focus time",set_focus_s:"Minutes per session",
 set_short_l:"Short break",set_short_s:"After each session",
 set_long_l:"Long break",set_long_s:"The longer rest",
 set_la_l:"Long break after",set_la_s:"Number of sessions",
 set_layout_l:"Timer style",set_layout_s:"How your timer looks",
 layout_ring:"Ring",layout_minimal:"Minimal",layout_card:"Card",
 set_sound_l:"Session sound",set_sound_s:"Chime when a session ends",
 sound_off:"Off",sound_soft:"Soft",sound_full:"Full",
 set_theme_l:"Accent theme",set_light_l:"Light mode",set_light_s:"Bright background",
 set_anim_l:"Animation level",set_anim_s:"How lively things feel",
 anim_minimal:"Minimal",anim_balanced:"Balanced",anim_expressive:"Expressive",
 set_ambient_l:"Ambient background",set_ambient_s:"A calm preset behind your timer",
 amb_none:"None",amb_dark:"Dark desk",amb_rain:"Rainy window",amb_library:"Library night",amb_forest:"Forest",amb_cream:"Minimal cream",amb_space:"Space",
 set_bg_l:"Your own photo",set_bg_s:"Dimmed for focus",set_bg_upload:"Upload photo",set_bg_clear:"Remove",
 set_comp_type_l:"Companion",set_comp_name_l:"Name",comp_name_ph:"e.g. Pixel, Sprout, Biscuit…",
 set_comp_vis_l:"When to show",vis_focus:"During focus",vis_after:"After sessions",vis_prog:"Progress only",vis_off:"Off",
 set_comp_anim_l:"Expressiveness",set_comp_tone_l:"Motivation style",
 tone_calm:"Calm",tone_friendly:"Friendly",tone_strict:"Strict",tone_gamer:"Gamer",tone_minimal:"Minimal",
 set_comp_sound_l:"Companion sound",csound_off:"Off",csound_soft:"Soft",csound_reward:"Rewards only",
 set_tips_l:"Wellbeing tips",set_tips_s:"Gentle reminders to drink, stretch, rest your eyes",
 set_data_export:"Export progress",set_data_export_s:"Save a backup file",
 set_data_import:"Import progress",set_data_import_s:"Load from a backup file",
 set_data_reset:"Wipe all data",set_data_reset_s:"Permanently delete everything",
 export_btn:"Download backup",import_btn:"Choose file",reset_btn:"Wipe everything",
 set_privacy:"FocusBlock stores your plan and progress locally in your browser. Nothing is sent to a server. Clearing browser data will erase it, and it won't sync to other devices.",
 // confirm new day / reset
 reset_t:"Wipe everything?",reset_msg:"This permanently deletes your name, subjects, streak, history and build. It cannot be undone.",
 reset_cancel:"Cancel",reset_confirm:"Wipe all",
 newday_t:"Start a new day?",newday_msg:"This clears today's plan. Your streak, history and build stay saved.",
 newday_cancel:"Keep going",newday_confirm:"Start fresh",
 invalid_backup:"That file isn't a valid FocusBlock backup.",
 // companions list names
 comp_plant:"Focus Plant",comp_cat:"Desk Cat",comp_dog:"Study Dog",comp_fire:"Fireflies",comp_bot:"Builder Bot",comp_zen:"Zen Stone",comp_lamp:"Night Lamp",comp_none:"None",
 comp_plant_d:"Calm, natural, grows with consistency.",comp_cat_d:"Cosy and quiet by your desk.",comp_dog_d:"Loyal and steady beside you.",comp_fire_d:"Soft lights that gather as you focus.",comp_bot_d:"Builds your study house, block by block.",comp_zen_d:"Ultra-minimal. No distraction.",comp_lamp_d:"A warm light that grows brighter.",comp_none_d:"No companion at all.",
 // tones quotes (study microcopy)
 tip_water:"💧 Drink some water.",tip_eyes:"👀 Look far away for 20 seconds.",tip_stretch:"🧍 Stand and stretch.",tip_breath:"🌬️ Three slow, deep breaths.",tip_walk:"🚶 Walk around for a minute.",tip_shoulder:"🙆 Roll your shoulders back.",
 // village stages
 vs_lot:"Empty plot",vs_tent:"Tent",vs_cabin:"Small cabin",vs_house:"Study house",vs_library:"Library",vs_cafe:"Café",vs_village:"Study village",
 // ready/end time strings
 ready_at:"ready at",ready_approx:"ready ~",
 // UI micro-copy
 tasks_lbl:"Tasks",drag_to_move:"Drag to move",break_recover:"Take a moment.",
 del_lbl:"Remove",add_subj_btn:"+ Subject",quick_add_lbl:"Quick add",break_until:"break until",
 start_at:"Start at",
 // Home cards (new)
 card_blocks_t:"Quick blocks",card_blocks_d:"Answer a few questions and get a ready-made plan. Fast and smart.",card_blocks_tag:"Fastest",
 card_day_t:"Day planner",card_day_d:"Build your own schedule: subjects, times and tasks — full control.",card_day_tag:"Full control",
 // Dagplanner screen
 dpl_title:"Day planner",dpl_sub:"Plan your study day without stress.",
 dpl_start:"Start",dpl_until:"Until",dpl_planned:"Planned",dpl_done_by:"Done by",
 dpl_quick_blocks:"Quick blocks",dpl_my_day:"My day",
 dpl_start_btn:"▶ Start planning",dpl_empty:"Add blocks above to build your day.",
 dpl_add_focus_25:"25 min focus",dpl_add_focus_50:"50 min focus",dpl_add_pause_5:"5 min break",dpl_add_pause_15:"15 min break",dpl_add_custom:"Custom",
 dpl_block_detail:"Block details",dpl_what:"What are you going to do?",dpl_how:"How are you going to do it?",
 dpl_type_focus:"Focus",dpl_type_pause:"Break",dpl_duration:"Duration",dpl_add_todo:"+ Add to-do",
 dpl_duplicate:"Duplicate day",plan_duplicated:"Day duplicated ✓",
 // Invite
 invite_title:"Share FocusBlock 💫",
 invite_sub:"You've completed {n} sessions! Share FocusBlock with friends who want to study better.",
 invite_copy:"Copy link",invite_copied:"Copied!",invite_share:"Share",invite_dismiss:"Maybe later",
 // Progress
 prog_open:"Progress",prog_intro:"Your study progress, all in one place.",
 prog_tip_blocks:"Total number of completed focus sessions.",
 prog_tip_focus:"Total time you've spent focused.",
 prog_tip_streak:"Consecutive study days. Keep it going!",
 // Agenda
 agenda_title:"Agenda",agenda_back:"Back",agenda_add_exam:"+ Exam",
 agenda_exam_lbl:"Exam",agenda_plan_lbl:"Study plan",agenda_no_events:"No events this day.",
 agenda_plan_day:"Plan this day",agenda_edit_day:"Edit plan",
 exam_add_t:"Add exam",exam_subject:"Subject / Course",exam_date:"Date",exam_time:"Time (optional)",exam_note:"Note",
 exam_save:"Save",exam_delete:"Remove",
 agenda_today:"Today",agenda_days_left:"{n} days",agenda_tomorrow:"Tomorrow",
 agenda_plan_d:"View your exam dates and plan study days in advance.",
 mot_1:"You don't need to study all day. A few focused hours beats a whole distracted day.",
 mot_2:"Every block you complete gets you closer. Keep going.",
 mot_3:"Progress, not perfection. One session at a time.",
 mot_4:"You're building something real — block by block.",
 mot_5:"Start. That's always the hardest part.",
 tip_sleep:"😴 Sleep is when your brain consolidates what you studied. Don't skip it.",
 tip_pomodoro:"🍅 Short focused sessions beat long unfocused ones every time.",
 tip_plan:"📋 A clear plan reduces stress. You've already done the hard part.",
 tip_break:"🚶 Walk during your break — it resets your focus.",
 tip_phone:"📵 Phone face-down = fewer interruptions = faster progress.",
},
};
TR.nl = {
 back:"Terug",next:"Volgende",continue:"Doorgaan",done:"Klaar",cancel:"Annuleren",save:"Opslaan",add:"Toevoegen",skip:"Overslaan",
 home_greet_new:"Welkom",home_greet:"Welkom terug, {name}",
 home_title_new:"Plan je dag.<br><em>Beheers je focus.</em>",home_title:"Hoi {name}.<br><em>Klaar om te focussen?</em>",
 home_sub:"Kies hoe je wilt beginnen. Je hoeft niet de hele dag te studeren — een paar gefocuste blokken, goed gedaan, is genoeg.",
 home_foot:"Je voortgang wordt alleen op dit apparaat bewaard. Geen account, geen server.",
 home_empty_t:"Klaar om te beginnen?",home_empty_d:"Kies hieronder hoe je wil starten. <em>Quick start</em> werkt meteen — geen setup nodig.",
 card_quick_t:"Snel starten",card_quick_d:"Spring meteen in een focusblok. Geen instellingen.",card_quick_tag:"Snelst",
 card_plan_t:"Plan mijn dag",card_plan_d:"Bouw een volledig plan: kies vakken, tijden en volgorde.",card_plan_tag:"Meeste controle",
 card_short_t:"Weinig tijd",card_short_d:"Geef je vakken en hoeveel tijd je hebt. Ik maak een snel plan.",card_short_tag:"Slim",
 card_last_t:"Vorige plan verder",card_last_d:"Ga verder waar je gebleven was.",card_last_tag:"",
 onb_lang_q:"Kies je <span>taal</span>",
 onb_name_q:"Eerst — wat is je <span>naam</span>?",name_ph:"Je naam…",
 onb_subj_q:"Welke <span>vakken</span> studeer je?",onb_subj_hint:"Voeg de vakken toe waar je aan werkt. Hieruit kies je later — en je kunt altijd nog iets nieuws typen.",subj_ph:"bv. Wiskunde, Frans, Biologie…",
 onb_comp_q:"Kies een <span>focus companion</span>",onb_comp_hint:"Een rustige metgezel die reageert op je focus. Volledig optioneel — hij blijft subtiel.",
 onb_theme_q:"Kies je <span>look</span>",onb_theme_hint:"Je kunt dit altijd aanpassen in instellingen.",
 dur_q:"Hoe wil je vandaag <span>studeren</span>?",dur_hint:"Kies een ritme dat bij je taak past — kort voor herhalen, langer voor begrijpen of schrijven.",
 count_q:"Hoeveel <span>sessies</span> vandaag?",count_hint:"Je hebt er niet veel nodig. Een handvol gefocuste blokken verslaat een hele afgeleide dag.",
 sess_unit:"sessies",
 assign_q:"Wat is het <span>plan</span> per sessie?",assign_hint:"Kies een vak per blok, stel de minuten in, voeg taken toe als je wil.",
 short_subj_q:"Wat moet je <span>doorkomen</span>?",short_subj_hint:"Kies of voeg de vakken voor vandaag toe.",
 short_custom:"Eigen tijd",hours_short:"u",min_short:"min",short_time_q:"Hoeveel <span>tijd</span> heb je?",short_time_hint:"Ik verdeel je vakken over focusblokken met pauzes.",
 minutes:"minuten",hours:"uur",
 ready_q:"Je <span>plan</span> is klaar",
 ready_dur:"Sessieduur",ready_blocks:"Sessies vandaag",ready_total:"Totaal focus",ready_subj:"Vakken",rec_badge:"Aanbevolen",
 begin:"Sessie starten",
 pick_subject:"Kies een vak",custom_subject:"Typ zelf iets…",no_subjects:"Nog geen vakken — voeg er hierboven toe.",
 add_task:"+ Taak toevoegen",task_ph:"Kleine taak…",note_ph:"Wat ga je precies doen?",note_lbl:"Notitie",
 now:"Nu",phase_focus:"Focus",phase_short:"Korte pauze",phase_long:"Lange pauze",
 ptab_focus:"Focus",ptab_short:"Korte pauze",ptab_long:"Lange pauze",
 ends_at:"Eindigt om",ep_start:"start de timer",ep_focus:"sessie eindigt",ep_break:"pauze eindigt",
 restart:"Opnieuw",skip_btn:"Overslaan",
 today_sessions:"Sessies vandaag",add_session:"+ Sessie toevoegen",
 session_n:"Sessie {n}",break_word:"pauze",
 sess_of:"Sessie {a} van {b}",
 db_done:"{n} klaar",db_focused:"{m} gefocust",
 break_short_msg:"Adem even uit.",break_long_msg:"Stap weg. Je hebt het verdiend.",
 m_ready:"Eén blok tegelijk.",m_started:"Begonnen. Dat is het moeilijkste.",m_quarter:"Je bouwt momentum.",m_half:"Halverwege. Hou de lijn vast.",m_three:"Bijna — niet nu stoppen.",m_near:"Maak dit blok sterk af.",
 pause_t:"Even pauzeren?",pause_msg:"Je bent al {min} minuten bezig. Nog {left} en dit blok telt volledig.",
 pause_t_en:"Even pauzeren?",pause_continue:"Doorgaan",pause_pause:"Toch pauzeren",
 skip_t:"Deze sessie overslaan?",skip_msg:"Dit telt niet mee voor je sessies, streak of bouw. Je bent dichterbij dan je denkt.",
 skip_continue:"Doorgaan",skip_confirm:"Toch overslaan",
 leave_warn:"Er loopt een focussessie. Toch weggaan?",
 reward_cheer:"Goed gedaan.",reward_sub:"Je hebt {min} minuten gefocust.",
 reward_block:"+1 bouwsteen",reward_points:"+{n} focuspunten",reward_build:"Je bouw is {pct}% klaar.",
 reward_streak:"Dagenreeks",reward_done:"Sessies klaar",reward_focus:"Gefocust",
 reward_reflect:"Hoe ging het?",
 reflect_well:"Goed gegaan",reflect_partial:"Gedeeltelijk",reflect_struggled:"Moeite gehad",
 reward_next:"Hierna: {name}",reward_continue:"Doorgaan",reward_break_now:"Neem je pauze",
 recap_t:"Dat is een dag.",recap_sub:"Elke sessie klaar. Echt, gefocust werk.",
 recap_blocks:"{n} focusblokken",recap_time:"{t} gestudeerd",recap_subj:"Gestudeerd: {list}",
 recap_tomorrow:"Morgen",recap_tom_msg:"Begin met {name} — hou het momentum vast.",
 recap_close:"Klaar voor vandaag",
 prog_title:"Jouw voortgang",prog_back:"Terug",
 prog_lifetime:"Totaal",lt_blocks:"Totaal sessies",lt_focus:"Totaal gefocust",lt_streak:"Dagenreeks",
 prog_week:"Deze week",prog_subjects:"Tijd per vak",prog_village:"Jouw study village",prog_companion:"Jouw companion",
 village_next:"<b>{n}</b> sessie{s} tot {name}",village_max:"Je hebt alles gebouwd. Laat je dorp verder groeien.",
 comp_lvl:"Level {n}",comp_grown:"Gegroeid door {n} focussessies.",comp_unnamed:"Jouw companion",
 no_subj_data:"Maak een paar focussessies af om je verdeling per vak te zien.",
 set_title:"Instellingen",settings_saved:"Instellingen opgeslagen",
 tab_timer:"Timer",tab_appear:"Design",tab_comp:"Companion",tab_subjects:"Vakken",tab_lang:"Taal",tab_data:"Data",
 set_subj_l:"Mijn vakken",set_subj_s:"Voeg vakken toe, hernoem of verwijder ze — klik op een naam om te hernoemen.",
 subj_rename_tip:"Klik om te hernoemen",
 set_focus_l:"Focustijd",set_focus_s:"Minuten per sessie",
 set_short_l:"Korte pauze",set_short_s:"Na elke sessie",
 set_long_l:"Lange pauze",set_long_s:"De langere rust",
 set_la_l:"Lange pauze na",set_la_s:"Aantal sessies",
 set_layout_l:"Timerstijl",set_layout_s:"Hoe je timer eruitziet",
 layout_ring:"Ring",layout_minimal:"Minimaal",layout_card:"Kaart",
 set_sound_l:"Sessiegeluid",set_sound_s:"Belletje als een sessie eindigt",
 sound_off:"Uit",sound_soft:"Zacht",sound_full:"Vol",
 set_theme_l:"Accentthema",set_light_l:"Lichte modus",set_light_s:"Heldere achtergrond",
 set_anim_l:"Animatieniveau",set_anim_s:"Hoe levendig het voelt",
 anim_minimal:"Minimaal",anim_balanced:"Gebalanceerd",anim_expressive:"Expressief",
 set_ambient_l:"Sfeerachtergrond",set_ambient_s:"Een rustige preset achter je timer",
 amb_none:"Geen",amb_dark:"Donker bureau",amb_rain:"Regenraam",amb_library:"Bibliotheek nacht",amb_forest:"Bos",amb_cream:"Minimaal crème",amb_space:"Ruimte",
 set_bg_l:"Je eigen foto",set_bg_s:"Gedempt voor focus",set_bg_upload:"Foto uploaden",set_bg_clear:"Verwijderen",
 set_comp_type_l:"Companion",set_comp_name_l:"Naam",comp_name_ph:"bv. Pixel, Spruit, Koekje…",
 set_comp_vis_l:"Wanneer tonen",vis_focus:"Tijdens focus",vis_after:"Na sessies",vis_prog:"Alleen progress",vis_off:"Uit",
 set_comp_anim_l:"Expressiviteit",set_comp_tone_l:"Motivatiestijl",
 tone_calm:"Rustig",tone_friendly:"Vriendelijk",tone_strict:"Streng",tone_gamer:"Gamer",tone_minimal:"Minimaal",
 set_comp_sound_l:"Companion geluid",csound_off:"Uit",csound_soft:"Zacht",csound_reward:"Alleen beloning",
 set_tips_l:"Welzijnstips",set_tips_s:"Zachte herinneringen om te drinken, rekken, je ogen te rusten",
 set_data_export:"Voortgang exporteren",set_data_export_s:"Sla een back-upbestand op",
 set_data_import:"Voortgang importeren",set_data_import_s:"Laden uit een back-upbestand",
 set_data_reset:"Alles wissen",set_data_reset_s:"Verwijder alles permanent",
 export_btn:"Back-up downloaden",import_btn:"Bestand kiezen",reset_btn:"Alles wissen",
 set_privacy:"FocusBlock bewaart je plan en voortgang lokaal in je browser. Er wordt niets naar een server gestuurd. Als je browsergegevens wist, is het weg, en het synchroniseert niet naar andere apparaten.",
 reset_t:"Alles wissen?",reset_msg:"Dit verwijdert je naam, vakken, streak, geschiedenis en bouw permanent. Dit kan niet ongedaan worden gemaakt.",
 reset_cancel:"Annuleren",reset_confirm:"Alles wissen",
 newday_t:"Nieuwe dag starten?",newday_msg:"Dit wist het plan van vandaag. Je streak, geschiedenis en bouw blijven bewaard.",
 newday_cancel:"Doorgaan",newday_confirm:"Opnieuw beginnen",
 invalid_backup:"Dat bestand is geen geldige FocusBlock back-up.",
 comp_plant:"Focus Plant",comp_cat:"Bureaukat",comp_dog:"Studiehond",comp_fire:"Vuurvliegjes",comp_bot:"Bouwrobot",comp_zen:"Zen-steen",comp_lamp:"Nachtlamp",comp_none:"Geen",
 comp_plant_d:"Rustig, natuurlijk, groeit door consistentie.",comp_cat_d:"Gezellig en stil bij je bureau.",comp_dog_d:"Loyaal en standvastig naast je.",comp_fire_d:"Zachte lichtjes die verschijnen terwijl je focust.",comp_bot_d:"Bouwt je studiehuis, blok per blok.",comp_zen_d:"Ultra-minimaal. Geen afleiding.",comp_lamp_d:"Een warm licht dat helderder wordt.",comp_none_d:"Helemaal geen companion.",
 tip_water:"💧 Drink wat water.",tip_eyes:"👀 Kijk 20 seconden in de verte.",tip_stretch:"🧍 Sta op en rek je uit.",tip_breath:"🌬️ Drie trage, diepe ademhalingen.",tip_walk:"🚶 Loop een minuutje rond.",tip_shoulder:"🙆 Rol je schouders naar achteren.",
 vs_lot:"Leeg perceel",vs_tent:"Tent",vs_cabin:"Klein huisje",vs_house:"Studiehuis",vs_library:"Bibliotheek",vs_cafe:"Café",vs_village:"Study village",
 ready_at:"klaar om",ready_approx:"klaar ~",
 tasks_lbl:"Taken",drag_to_move:"Slepen om te verplaatsen",break_recover:"Even bijkomen.",
 del_lbl:"Verwijderen",add_subj_btn:"+ Vak",quick_add_lbl:"Snel toevoegen",break_until:"pauze tot",
 start_at:"Start om",
 // Home cards (new)
 card_blocks_t:"Snelle blokken",card_blocks_d:"Beantwoord een paar vragen en krijg een kant-en-klaar plan. Snel en slim.",card_blocks_tag:"Snelst",
 card_day_t:"Dagplanning",card_day_d:"Maak zelf je schema: vakken, tijden en taken — volledige controle.",card_day_tag:"Volledig beheer",
 // Dagplanner
 dpl_title:"Dagplanning",dpl_sub:"Plan je studiedag zonder stress.",
 dpl_start:"Start",dpl_until:"Tot",dpl_planned:"Gepland",dpl_done_by:"Klaar om",
 dpl_quick_blocks:"Snelle blokken",dpl_my_day:"Mijn dag",
 dpl_start_btn:"▶ Planning starten",dpl_empty:"Voeg blokken toe om je dag op te bouwen.",
 dpl_add_focus_25:"25 min focus",dpl_add_focus_50:"50 min focus",dpl_add_pause_5:"5 min pauze",dpl_add_pause_15:"15 min pauze",dpl_add_custom:"Aangepast",
 dpl_block_detail:"Blokdetails",dpl_what:"Wat ga je doen?",dpl_how:"Hoe ga je het doen?",
 dpl_type_focus:"Focus",dpl_type_pause:"Pauze",dpl_duration:"Duur",dpl_add_todo:"+ To-do toevoegen",
 dpl_duplicate:"Dag dupliceren",plan_duplicated:"Dag gedupliceerd ✓",
 // Invite
 invite_title:"Deel FocusBlock 💫",
 invite_sub:"Je hebt al {n} sessies voltooid! Deel FocusBlock met vrienden die ook beter willen studeren.",
 invite_copy:"Link kopiëren",invite_copied:"Gekopieerd!",invite_share:"Delen",invite_dismiss:"Misschien later",
 // Progress
 prog_open:"Voortgang",prog_intro:"Je studievoorgang, alles op één plek.",
 prog_tip_blocks:"Totaal aantal voltooide focussessies.",
 prog_tip_focus:"Totale tijd dat je gefocust hebt gestudeerd.",
 prog_tip_streak:"Opeenvolgende studie-dagen. Hou het vol!",
 // Agenda
 agenda_title:"Agenda",agenda_back:"Terug",agenda_add_exam:"+ Examen",
 agenda_exam_lbl:"Examen",agenda_plan_lbl:"Studieplan",agenda_no_events:"Geen events op deze dag.",
 agenda_plan_day:"Plan deze dag",agenda_edit_day:"Plan aanpassen",
 exam_add_t:"Examen toevoegen",exam_subject:"Vak / Cursus",exam_date:"Datum",exam_time:"Tijdstip (optioneel)",exam_note:"Notitie",
 exam_save:"Opslaan",exam_delete:"Verwijderen",
 agenda_today:"Vandaag",agenda_days_left:"{n} dagen",agenda_tomorrow:"Morgen",
 agenda_plan_d:"Bekijk je examendatums en plan studiedagen vooruit.",
 mot_1:"Je hoeft niet de hele dag te studeren. Een paar gefocuste uren klopt een hele afleidende dag.",
 mot_2:"Elk blok dat je afmaakt brengt je dichterbij. Ga door.",
 mot_3:"Vooruitgang, niet perfectie. Één sessie tegelijk.",
 mot_4:"Je bouwt aan iets echts — blok voor blok.",
 mot_5:"Begin. Dat is altijd het moeilijkste deel.",
 tip_sleep:"😴 Slaap is wanneer je brein verwerkt wat je geleerd hebt. Niet overslaan.",
 tip_pomodoro:"🍅 Korte gefocuste sessies kloppen lange ongeconcentreerde altijd.",
 tip_plan:"📋 Een goed plan vermindert stress. Je hebt al het moeilijkste gedaan.",
 tip_break:"🚶 Loop even rond in je pauze — het herstelt je focus.",
 tip_phone:"📵 Telefoon omgekeerd = minder onderbrekingen = sneller klaar.",
};
TR.fr = {
 back:"Retour",next:"Suivant",continue:"Continuer",done:"Terminé",cancel:"Annuler",save:"Enregistrer",add:"Ajouter",skip:"Passer",
 home_greet_new:"Bienvenue",home_greet:"Bon retour, {name}",
 home_title_new:"Planifie ta journée.<br><em>Maîtrise ta concentration.</em>",home_title:"Salut {name}.<br><em>Prêt à te concentrer ?</em>",
 home_sub:"Choisis comment commencer. Pas besoin d'étudier toute la journée — quelques blocs concentrés, bien faits, suffisent.",
 home_foot:"Ta progression est enregistrée uniquement sur cet appareil. Pas de compte, pas de serveur.",
 home_empty_t:"Prêt à commencer ?",home_empty_d:"Choisis comment tu veux commencer ci-dessous. <em>Démarrage rapide</em> fonctionne immédiatement — sans configuration.",
 card_quick_t:"Démarrage rapide",card_quick_d:"Plonge directement dans un bloc de focus. Sans réglages.",card_quick_tag:"Le plus rapide",
 card_plan_t:"Planifier ma journée",card_plan_d:"Construis un plan complet : matières, durées et ordre.",card_plan_tag:"Plus de contrôle",
 card_short_t:"Peu de temps",card_short_d:"Donne tes matières et ton temps. Je crée un plan rapide.",card_short_tag:"Malin",
 card_last_t:"Reprendre le plan",card_last_d:"Reprends là où tu t'es arrêté.",card_last_tag:"",
 onb_lang_q:"Choisis ta <span>langue</span>",
 onb_name_q:"D'abord — quel est ton <span>prénom</span> ?",name_ph:"Ton prénom…",
 onb_subj_q:"Quelles <span>matières</span> étudies-tu ?",onb_subj_hint:"Ajoute les matières sur lesquelles tu travailles. Tu choisiras parmi elles plus tard — et tu peux toujours en taper d'autres.",subj_ph:"ex. Maths, Français, Biologie…",
 onb_comp_q:"Choisis un <span>compagnon de focus</span>",onb_comp_hint:"Un compagnon calme qui réagit à ta concentration. Totalement optionnel — il reste discret.",
 onb_theme_q:"Choisis ton <span>style</span>",onb_theme_hint:"Tu peux changer cela à tout moment dans les réglages.",
 dur_q:"Comment veux-tu <span>étudier</span> aujourd'hui ?",dur_hint:"Choisis un rythme adapté à ta tâche — court pour réviser, long pour comprendre ou rédiger.",
 count_q:"Combien de <span>sessions</span> aujourd'hui ?",count_hint:"Pas besoin de beaucoup. Quelques blocs concentrés valent mieux qu'une journée distraite.",
 sess_unit:"sessions",
 assign_q:"Quel est le <span>plan</span> par session ?",assign_hint:"Choisis une matière par bloc, règle les minutes, ajoute des tâches si tu veux.",
 short_subj_q:"Que dois-tu <span>terminer</span> ?",short_subj_hint:"Choisis ou ajoute les matières du jour.",
 short_custom:"Personnalisé",hours_short:"h",min_short:"min",short_time_q:"Combien de <span>temps</span> as-tu ?",short_time_hint:"Je répartis tes matières en blocs avec des pauses.",
 minutes:"minutes",hours:"heures",
 ready_q:"Ton <span>plan</span> est prêt",
 ready_dur:"Durée de session",ready_blocks:"Sessions du jour",ready_total:"Focus total",ready_subj:"Matières",rec_badge:"Recommandé",
 begin:"Commencer",
 pick_subject:"Choisis une matière",custom_subject:"Tape la tienne…",no_subjects:"Aucune matière — ajoutes-en ci-dessus.",
 add_task:"+ Ajouter une tâche",task_ph:"Petite tâche…",note_ph:"Que vas-tu faire exactement ?",note_lbl:"Note",
 now:"Maintenant",phase_focus:"Concentration",phase_short:"Courte pause",phase_long:"Longue pause",
 ptab_focus:"Concentration",ptab_short:"Courte pause",ptab_long:"Longue pause",
 ends_at:"Fin à",ep_start:"démarre le minuteur",ep_focus:"fin de session",ep_break:"fin de pause",
 restart:"Recommencer",skip_btn:"Passer",
 today_sessions:"Sessions du jour",add_session:"+ Ajouter",
 session_n:"Session {n}",break_word:"pause",
 sess_of:"Session {a} sur {b}",
 db_done:"{n} faites",db_focused:"{m} de focus",
 break_short_msg:"Respire un peu.",break_long_msg:"Éloigne-toi. Tu l'as mérité.",
 m_ready:"Un bloc à la fois.",m_started:"Lancé. C'est le plus dur.",m_quarter:"L'élan s'installe.",m_half:"À mi-chemin. Tiens bon.",m_three:"Presque — ne casse pas l'élan.",m_near:"Termine ce bloc en force.",
 pause_t:"Faire une pause ?",pause_msg:"Tu es à {min} minutes. Encore {left} et ce bloc compte entièrement.",
 pause_t_en:"Faire une pause ?",pause_continue:"Continuer",pause_pause:"Mettre en pause",
 skip_t:"Passer cette session ?",skip_msg:"Cela ne comptera pas pour tes sessions, ta série ou ta construction. Tu es plus proche que tu ne crois.",
 skip_continue:"Continuer",skip_confirm:"Passer quand même",
 leave_warn:"Une session de focus est en cours. Quitter quand même ?",
 reward_cheer:"Bien joué.",reward_sub:"Tu t'es concentré {min} minutes.",
 reward_block:"+1 bloc de construction",reward_points:"+{n} points de focus",reward_build:"Ta construction est à {pct}%.",
 reward_streak:"Série de jours",reward_done:"Sessions faites",reward_focus:"Concentré",
 reward_reflect:"Comment ça s'est passé ?",
 reflect_well:"Bien passé",reflect_partial:"Partiellement",reflect_struggled:"Difficile",
 reward_next:"Ensuite : {name}",reward_continue:"Continuer",reward_break_now:"Prends ta pause",
 recap_t:"Belle journée.",recap_sub:"Chaque session faite. Du vrai travail concentré.",
 recap_blocks:"{n} blocs de focus",recap_time:"{t} étudié",recap_subj:"Étudié : {list}",
 recap_tomorrow:"Demain",recap_tom_msg:"Commence par {name} — garde l'élan.",
 recap_close:"Terminé pour aujourd'hui",
 prog_title:"Ta progression",prog_back:"Retour",
 prog_lifetime:"Au total",lt_blocks:"Sessions totales",lt_focus:"Focus total",lt_streak:"Série de jours",
 prog_week:"Cette semaine",prog_subjects:"Temps par matière",prog_village:"Ton village d'étude",prog_companion:"Ton compagnon",
 village_next:"<b>{n}</b> session{s} avant {name}",village_max:"Tu as tout construit. Continue à agrandir ton village.",
 comp_lvl:"Niveau {n}",comp_grown:"Grandi grâce à {n} sessions de focus.",comp_unnamed:"Ton compagnon",
 no_subj_data:"Termine quelques sessions pour voir la répartition par matière.",
 set_title:"Réglages",settings_saved:"Réglages enregistrés",
 tab_timer:"Minuteur",tab_appear:"Design",tab_comp:"Compagnon",tab_subjects:"Matières",tab_lang:"Langue",tab_data:"Données",
 set_subj_l:"Mes matières",set_subj_s:"Ajouter, renommer ou supprimer des matières — clique sur un nom pour le renommer.",
 subj_rename_tip:"Cliquer pour renommer",
 set_focus_l:"Temps de focus",set_focus_s:"Minutes par session",
 set_short_l:"Courte pause",set_short_s:"Après chaque session",
 set_long_l:"Longue pause",set_long_s:"Le repos plus long",
 set_la_l:"Longue pause après",set_la_s:"Nombre de sessions",
 set_layout_l:"Style du minuteur",set_layout_s:"L'apparence de ton minuteur",
 layout_ring:"Anneau",layout_minimal:"Minimal",layout_card:"Carte",
 set_sound_l:"Son de session",set_sound_s:"Carillon à la fin d'une session",
 sound_off:"Désactivé",sound_soft:"Doux",sound_full:"Complet",
 set_theme_l:"Thème d'accent",set_light_l:"Mode clair",set_light_s:"Fond clair",
 set_anim_l:"Niveau d'animation",set_anim_s:"À quel point c'est vivant",
 anim_minimal:"Minimal",anim_balanced:"Équilibré",anim_expressive:"Expressif",
 set_ambient_l:"Fond d'ambiance",set_ambient_s:"Un décor calme derrière ton minuteur",
 amb_none:"Aucun",amb_dark:"Bureau sombre",amb_rain:"Fenêtre pluvieuse",amb_library:"Bibliothèque nuit",amb_forest:"Forêt",amb_cream:"Crème minimal",amb_space:"Espace",
 set_bg_l:"Ta propre photo",set_bg_s:"Atténuée pour le focus",set_bg_upload:"Importer une photo",set_bg_clear:"Retirer",
 set_comp_type_l:"Compagnon",set_comp_name_l:"Nom",comp_name_ph:"ex. Pixel, Pousse, Biscuit…",
 set_comp_vis_l:"Quand l'afficher",vis_focus:"Pendant le focus",vis_after:"Après les sessions",vis_prog:"Progression seulement",vis_off:"Désactivé",
 set_comp_anim_l:"Expressivité",set_comp_tone_l:"Style de motivation",
 tone_calm:"Calme",tone_friendly:"Amical",tone_strict:"Strict",tone_gamer:"Gamer",tone_minimal:"Minimal",
 set_comp_sound_l:"Son du compagnon",csound_off:"Désactivé",csound_soft:"Doux",csound_reward:"Récompenses seulement",
 set_tips_l:"Conseils bien-être",set_tips_s:"Rappels doux : boire, s'étirer, reposer les yeux",
 set_data_export:"Exporter la progression",set_data_export_s:"Enregistrer une sauvegarde",
 set_data_import:"Importer la progression",set_data_import_s:"Charger depuis une sauvegarde",
 set_data_reset:"Tout effacer",set_data_reset_s:"Supprimer tout définitivement",
 export_btn:"Télécharger la sauvegarde",import_btn:"Choisir un fichier",reset_btn:"Tout effacer",
 set_privacy:"FocusBlock enregistre ton plan et ta progression localement dans ton navigateur. Rien n'est envoyé à un serveur. Effacer les données du navigateur les supprimera, et cela ne se synchronise pas entre appareils.",
 reset_t:"Tout effacer ?",reset_msg:"Cela supprime définitivement ton nom, tes matières, ta série, ton historique et ta construction. Irréversible.",
 reset_cancel:"Annuler",reset_confirm:"Tout effacer",
 newday_t:"Commencer une nouvelle journée ?",newday_msg:"Cela efface le plan d'aujourd'hui. Ta série, ton historique et ta construction restent sauvegardés.",
 newday_cancel:"Continuer",newday_confirm:"Recommencer",
 invalid_backup:"Ce fichier n'est pas une sauvegarde FocusBlock valide.",
 comp_plant:"Plante de focus",comp_cat:"Chat de bureau",comp_dog:"Chien d'étude",comp_fire:"Lucioles",comp_bot:"Robot bâtisseur",comp_zen:"Pierre zen",comp_lamp:"Lampe de nuit",comp_none:"Aucun",
 comp_plant_d:"Calme, naturel, grandit par la régularité.",comp_cat_d:"Cosy et tranquille près de ton bureau.",comp_dog_d:"Loyal et stable à tes côtés.",comp_fire_d:"De douces lumières qui s'assemblent.",comp_bot_d:"Construit ta maison d'étude, bloc par bloc.",comp_zen_d:"Ultra-minimal. Aucune distraction.",comp_lamp_d:"Une lumière chaude qui s'intensifie.",comp_none_d:"Aucun compagnon.",
 tip_water:"💧 Bois un peu d'eau.",tip_eyes:"👀 Regarde au loin 20 secondes.",tip_stretch:"🧍 Lève-toi et étire-toi.",tip_breath:"🌬️ Trois respirations lentes.",tip_walk:"🚶 Marche une minute.",tip_shoulder:"🙆 Roule les épaules en arrière.",
 vs_lot:"Terrain vide",vs_tent:"Tente",vs_cabin:"Petite cabane",vs_house:"Maison d'étude",vs_library:"Bibliothèque",vs_cafe:"Café",vs_village:"Village d'étude",
 ready_at:"prêt à",ready_approx:"prêt ~",
 tasks_lbl:"Tâches",drag_to_move:"Glisser pour déplacer",break_recover:"Prends un moment.",
 del_lbl:"Supprimer",add_subj_btn:"+ Matière",quick_add_lbl:"Ajout rapide",break_until:"pause jusqu'à",
 start_at:"Début à",
 // Home cards (new)
 card_blocks_t:"Blocs rapides",card_blocks_d:"Ajoute des blocs de focus et commence immédiatement. Simple et rapide.",card_blocks_tag:"Le plus rapide",
 card_day_t:"Planning du jour",card_day_d:"Construis ta journée d'étude complète avec horaires, matières et to-dos.",card_day_tag:"Contrôle total",
 // Dagplanner
 dpl_title:"Planning du jour",dpl_sub:"Planifie ta journée d'étude sans stress.",
 dpl_start:"Début",dpl_until:"Jusqu'à",dpl_planned:"Planifié",dpl_done_by:"Terminé à",
 dpl_quick_blocks:"Blocs rapides",dpl_my_day:"Ma journée",
 dpl_start_btn:"▶ Commencer le planning",dpl_empty:"Ajoute des blocs pour construire ta journée.",
 dpl_add_focus_25:"25 min focus",dpl_add_focus_50:"50 min focus",dpl_add_pause_5:"5 min pause",dpl_add_pause_15:"15 min pause",dpl_add_custom:"Personnalisé",
 dpl_block_detail:"Détails du bloc",dpl_what:"Que vas-tu faire ?",dpl_how:"Comment vas-tu le faire ?",
 dpl_type_focus:"Focus",dpl_type_pause:"Pause",dpl_duration:"Durée",dpl_add_todo:"+ Ajouter une tâche",
 dpl_duplicate:"Dupliquer la journée",plan_duplicated:"Journée dupliquée ✓",
 // Invite
 invite_title:"Partage FocusBlock 💫",
 invite_sub:"Tu as complété {n} sessions ! Partage FocusBlock avec des amis qui veulent mieux étudier.",
 invite_copy:"Copier le lien",invite_copied:"Copié !",invite_share:"Partager",invite_dismiss:"Peut-être plus tard",
 // Progress
 prog_open:"Progression",prog_intro:"Ta progression d'étude, tout en un seul endroit.",
 prog_tip_blocks:"Nombre total de sessions de focus terminées.",
 prog_tip_focus:"Temps total passé à te concentrer.",
 prog_tip_streak:"Jours d'étude consécutifs. Continue !",
 // Agenda
 agenda_title:"Agenda",agenda_back:"Retour",agenda_add_exam:"+ Examen",
 agenda_exam_lbl:"Examen",agenda_plan_lbl:"Plan d'étude",agenda_no_events:"Aucun événement ce jour.",
 agenda_plan_day:"Planifier ce jour",agenda_edit_day:"Modifier le plan",
 exam_add_t:"Ajouter un examen",exam_subject:"Matière / Cours",exam_date:"Date",exam_time:"Heure (optionnel)",exam_note:"Note",
 exam_save:"Enregistrer",exam_delete:"Supprimer",
 agenda_today:"Aujourd'hui",agenda_days_left:"{n} jours",agenda_tomorrow:"Demain",
 agenda_plan_d:"Consulte tes dates d'examens et planifie tes journées d'étude à l'avance.",
 mot_1:"Tu n'as pas besoin d'étudier toute la journée. Quelques heures concentrées valent mieux qu'une journée distraite.",
 mot_2:"Chaque bloc terminé te rapproche du but. Continue.",
 mot_3:"Progression, pas perfection. Une session à la fois.",
 mot_4:"Tu construis quelque chose de réel — bloc par bloc.",
 mot_5:"Commence. C'est toujours la partie la plus difficile.",
 tip_sleep:"😴 Le sommeil consolide ce que tu as étudié. Ne le néglige pas.",
 tip_pomodoro:"🍅 De courtes sessions concentrées battent les longues sessions dispersées.",
 tip_plan:"📋 Un plan clair réduit le stress. Tu as déjà fait le plus dur.",
 tip_break:"🚶 Marche pendant ta pause — ça remet le focus.",
 tip_phone:"📵 Téléphone face cachée = moins d'interruptions = plus vite fini.",
};
TR.es = {
 back:"Atrás",next:"Siguiente",continue:"Continuar",done:"Listo",cancel:"Cancelar",save:"Guardar",add:"Añadir",skip:"Saltar",
 home_greet_new:"Bienvenido",home_greet:"Bienvenido de nuevo, {name}",
 home_title_new:"Planifica tu día.<br><em>Domina tu enfoque.</em>",home_title:"Hola {name}.<br><em>¿Listo para enfocarte?</em>",
 home_sub:"Elige cómo empezar. No tienes que estudiar todo el día — bastan unos bloques enfocados, bien hechos.",
 home_foot:"Tu progreso se guarda solo en este dispositivo. Sin cuenta, sin servidor.",
 home_empty_t:"¿Listo para empezar?",home_empty_d:"Elige cómo quieres comenzar abajo. <em>Inicio rápido</em> funciona de inmediato — sin configuración.",
 card_quick_t:"Inicio rápido",card_quick_d:"Entra directo a un bloque de enfoque. Sin ajustes.",card_quick_tag:"Más rápido",
 card_plan_t:"Planifica mi día",card_plan_d:"Crea un plan completo: materias, tiempos y orden.",card_plan_tag:"Más control",
 card_short_t:"Poco tiempo",card_short_d:"Dime tus materias y tu tiempo. Te armo un plan rápido.",card_short_tag:"Inteligente",
 card_last_t:"Seguir último plan",card_last_d:"Continúa donde lo dejaste.",card_last_tag:"",
 onb_lang_q:"Elige tu <span>idioma</span>",
 onb_name_q:"Primero — ¿cuál es tu <span>nombre</span>?",name_ph:"Tu nombre…",
 onb_subj_q:"¿Qué <span>materias</span> estudias?",onb_subj_hint:"Añade las materias en las que trabajas. Luego elegirás de ellas — y siempre puedes escribir nuevas.",subj_ph:"ej. Matemáticas, Francés, Biología…",
 onb_comp_q:"Elige un <span>compañero de enfoque</span>",onb_comp_hint:"Un compañero tranquilo que reacciona a tu enfoque. Totalmente opcional — se mantiene sutil.",
 onb_theme_q:"Elige tu <span>estilo</span>",onb_theme_hint:"Puedes cambiarlo cuando quieras en ajustes.",
 dur_q:"¿Cómo quieres <span>estudiar</span> hoy?",dur_hint:"Elige un ritmo según tu tarea — corto para repasar, largo para entender o escribir.",
 count_q:"¿Cuántas <span>sesiones</span> hoy?",count_hint:"No necesitas muchas. Unos bloques enfocados superan un día entero distraído.",
 sess_unit:"sesiones",
 assign_q:"¿Cuál es el <span>plan</span> por sesión?",assign_hint:"Elige una materia por bloque, ajusta los minutos, añade tareas si quieres.",
 short_subj_q:"¿Qué necesitas <span>terminar</span>?",short_subj_hint:"Elige o añade las materias de hoy.",
 short_custom:"Personalizado",hours_short:"h",min_short:"min",short_time_q:"¿Cuánto <span>tiempo</span> tienes?",short_time_hint:"Reparto tus materias en bloques con descansos.",
 minutes:"minutos",hours:"horas",
 ready_q:"Tu <span>plan</span> está listo",
 ready_dur:"Duración de sesión",ready_blocks:"Sesiones hoy",ready_total:"Enfoque total",ready_subj:"Materias",rec_badge:"Recomendado",
 begin:"Comenzar",
 pick_subject:"Elige una materia",custom_subject:"Escribe la tuya…",no_subjects:"Aún no hay materias — añade arriba.",
 add_task:"+ Añadir tarea",task_ph:"Tarea pequeña…",note_ph:"¿Qué harás exactamente?",note_lbl:"Nota",
 now:"Ahora",phase_focus:"Enfoque",phase_short:"Descanso corto",phase_long:"Descanso largo",
 ptab_focus:"Enfoque",ptab_short:"Descanso corto",ptab_long:"Descanso largo",
 ends_at:"Termina a",ep_start:"inicia el temporizador",ep_focus:"fin de sesión",ep_break:"fin del descanso",
 restart:"Reiniciar",skip_btn:"Saltar",
 today_sessions:"Sesiones de hoy",add_session:"+ Añadir",
 session_n:"Sesión {n}",break_word:"descanso",
 sess_of:"Sesión {a} de {b}",
 db_done:"{n} hechas",db_focused:"{m} de enfoque",
 break_short_msg:"Respira un momento.",break_long_msg:"Aléjate. Te lo ganaste.",
 m_ready:"Un bloque a la vez.",m_started:"Empezaste. Eso es lo difícil.",m_quarter:"Tomando impulso.",m_half:"A mitad. Mantén la línea.",m_three:"Casi — no lo rompas.",m_near:"Termina este bloque fuerte.",
 pause_t:"¿Pausar?",pause_msg:"Llevas {min} minutos. {left} más y este bloque cuenta completo.",
 pause_t_en:"¿Pausar?",pause_continue:"Continuar",pause_pause:"Pausar igual",
 skip_t:"¿Saltar esta sesión?",skip_msg:"No contará para tus sesiones, racha ni construcción. Estás más cerca de lo que crees.",
 skip_continue:"Continuar",skip_confirm:"Saltar igual",
 leave_warn:"Hay una sesión de enfoque en curso. ¿Salir igual?",
 reward_cheer:"Bien hecho.",reward_sub:"Te enfocaste {min} minutos.",
 reward_block:"+1 bloque de construcción",reward_points:"+{n} puntos de enfoque",reward_build:"Tu construcción va al {pct}%.",
 reward_streak:"Racha de días",reward_done:"Sesiones hechas",reward_focus:"Enfocado",
 reward_reflect:"¿Cómo fue?",
 reflect_well:"Bien",reflect_partial:"Parcial",reflect_struggled:"Costó",
 reward_next:"Sigue: {name}",reward_continue:"Continuar",reward_break_now:"Toma tu descanso",
 recap_t:"Eso es un día.",recap_sub:"Cada sesión hecha. Trabajo real y enfocado.",
 recap_blocks:"{n} bloques de enfoque",recap_time:"{t} estudiado",recap_subj:"Estudiado: {list}",
 recap_tomorrow:"Mañana",recap_tom_msg:"Empieza con {name} — mantén el impulso.",
 recap_close:"Listo por hoy",
 prog_title:"Tu progreso",prog_back:"Atrás",
 prog_lifetime:"Total",lt_blocks:"Sesiones totales",lt_focus:"Enfoque total",lt_streak:"Racha de días",
 prog_week:"Esta semana",prog_subjects:"Tiempo por materia",prog_village:"Tu aldea de estudio",prog_companion:"Tu compañero",
 village_next:"<b>{n}</b> sesión{s} hasta {name}",village_max:"Lo construiste todo. Sigue ampliando tu aldea.",
 comp_lvl:"Nivel {n}",comp_grown:"Creció con {n} sesiones de enfoque.",comp_unnamed:"Tu compañero",
 no_subj_data:"Termina algunas sesiones para ver tu desglose por materia.",
 set_title:"Ajustes",settings_saved:"Ajustes guardados",
 tab_timer:"Temporizador",tab_appear:"Diseño",tab_comp:"Compañero",tab_subjects:"Materias",tab_lang:"Idioma",tab_data:"Datos",
 set_subj_l:"Mis materias",set_subj_s:"Añade, renombra o elimina materias — haz clic en un nombre para renombrarlo.",
 subj_rename_tip:"Clic para renombrar",
 set_focus_l:"Tiempo de enfoque",set_focus_s:"Minutos por sesión",
 set_short_l:"Descanso corto",set_short_s:"Tras cada sesión",
 set_long_l:"Descanso largo",set_long_s:"El descanso más largo",
 set_la_l:"Descanso largo tras",set_la_s:"Número de sesiones",
 set_layout_l:"Estilo del temporizador",set_layout_s:"Cómo se ve tu temporizador",
 layout_ring:"Anillo",layout_minimal:"Mínimo",layout_card:"Tarjeta",
 set_sound_l:"Sonido de sesión",set_sound_s:"Campana al terminar una sesión",
 sound_off:"Apagado",sound_soft:"Suave",sound_full:"Completo",
 set_theme_l:"Tema de acento",set_light_l:"Modo claro",set_light_s:"Fondo brillante",
 set_anim_l:"Nivel de animación",set_anim_s:"Qué tan vivo se siente",
 anim_minimal:"Mínimo",anim_balanced:"Equilibrado",anim_expressive:"Expresivo",
 set_ambient_l:"Fondo ambiental",set_ambient_s:"Un fondo tranquilo tras tu temporizador",
 amb_none:"Ninguno",amb_dark:"Escritorio oscuro",amb_rain:"Ventana lluviosa",amb_library:"Biblioteca de noche",amb_forest:"Bosque",amb_cream:"Crema mínimo",amb_space:"Espacio",
 set_bg_l:"Tu propia foto",set_bg_s:"Atenuada para enfoque",set_bg_upload:"Subir foto",set_bg_clear:"Quitar",
 set_comp_type_l:"Compañero",set_comp_name_l:"Nombre",comp_name_ph:"ej. Pixel, Brote, Galleta…",
 set_comp_vis_l:"Cuándo mostrar",vis_focus:"Durante el enfoque",vis_after:"Tras las sesiones",vis_prog:"Solo en progreso",vis_off:"Apagado",
 set_comp_anim_l:"Expresividad",set_comp_tone_l:"Estilo de motivación",
 tone_calm:"Tranquilo",tone_friendly:"Amistoso",tone_strict:"Estricto",tone_gamer:"Gamer",tone_minimal:"Mínimo",
 set_comp_sound_l:"Sonido del compañero",csound_off:"Apagado",csound_soft:"Suave",csound_reward:"Solo recompensas",
 set_tips_l:"Consejos de bienestar",set_tips_s:"Recordatorios suaves: beber, estirar, descansar la vista",
 set_data_export:"Exportar progreso",set_data_export_s:"Guardar una copia de seguridad",
 set_data_import:"Importar progreso",set_data_import_s:"Cargar desde una copia",
 set_data_reset:"Borrar todo",set_data_reset_s:"Eliminar todo permanentemente",
 export_btn:"Descargar copia",import_btn:"Elegir archivo",reset_btn:"Borrar todo",
 set_privacy:"FocusBlock guarda tu plan y progreso localmente en tu navegador. No se envía nada a un servidor. Borrar los datos del navegador lo eliminará y no se sincroniza entre dispositivos.",
 reset_t:"¿Borrar todo?",reset_msg:"Esto elimina permanentemente tu nombre, materias, racha, historial y construcción. No se puede deshacer.",
 reset_cancel:"Cancelar",reset_confirm:"Borrar todo",
 newday_t:"¿Empezar un nuevo día?",newday_msg:"Esto borra el plan de hoy. Tu racha, historial y construcción se conservan.",
 newday_cancel:"Continuar",newday_confirm:"Empezar de nuevo",
 invalid_backup:"Ese archivo no es una copia válida de FocusBlock.",
 comp_plant:"Planta de enfoque",comp_cat:"Gato de escritorio",comp_dog:"Perro de estudio",comp_fire:"Luciérnagas",comp_bot:"Robot constructor",comp_zen:"Piedra zen",comp_lamp:"Lámpara nocturna",comp_none:"Ninguno",
 comp_plant_d:"Calma, natural, crece con la constancia.",comp_cat_d:"Acogedor y tranquilo en tu escritorio.",comp_dog_d:"Leal y firme a tu lado.",comp_fire_d:"Luces suaves que se reúnen mientras te enfocas.",comp_bot_d:"Construye tu casa de estudio, bloque a bloque.",comp_zen_d:"Ultra-mínimo. Sin distracción.",comp_lamp_d:"Una luz cálida que se intensifica.",comp_none_d:"Ningún compañero.",
 tip_water:"💧 Bebe un poco de agua.",tip_eyes:"👀 Mira lejos 20 segundos.",tip_stretch:"🧍 Levántate y estírate.",tip_breath:"🌬️ Tres respiraciones lentas.",tip_walk:"🚶 Camina un minuto.",tip_shoulder:"🙆 Gira los hombros hacia atrás.",
 vs_lot:"Solar vacío",vs_tent:"Tienda",vs_cabin:"Cabaña pequeña",vs_house:"Casa de estudio",vs_library:"Biblioteca",vs_cafe:"Café",vs_village:"Aldea de estudio",
 ready_at:"listo a",ready_approx:"listo ~",
 tasks_lbl:"Tareas",drag_to_move:"Arrastrar para mover",break_recover:"Tómate un momento.",
 del_lbl:"Eliminar",add_subj_btn:"+ Materia",quick_add_lbl:"Añadir rápido",break_until:"descanso hasta",
 start_at:"Comienza a",
 // Home cards (new)
 card_blocks_t:"Bloques rápidos",card_blocks_d:"Añade bloques de enfoque y empieza de inmediato. Simple y rápido.",card_blocks_tag:"Más rápido",
 card_day_t:"Planificación del día",card_day_d:"Construye tu jornada de estudio completa con horarios, materias y to-dos.",card_day_tag:"Control total",
 // Dagplanner
 dpl_title:"Planificación del día",dpl_sub:"Planifica tu jornada de estudio sin estrés.",
 dpl_start:"Inicio",dpl_until:"Hasta",dpl_planned:"Planificado",dpl_done_by:"Listo a",
 dpl_quick_blocks:"Bloques rápidos",dpl_my_day:"Mi día",
 dpl_start_btn:"▶ Iniciar planificación",dpl_empty:"Añade bloques para construir tu día.",
 dpl_add_focus_25:"25 min enfoque",dpl_add_focus_50:"50 min enfoque",dpl_add_pause_5:"5 min descanso",dpl_add_pause_15:"15 min descanso",dpl_add_custom:"Personalizado",
 dpl_block_detail:"Detalles del bloque",dpl_what:"¿Qué vas a hacer?",dpl_how:"¿Cómo lo vas a hacer?",
 dpl_type_focus:"Enfoque",dpl_type_pause:"Descanso",dpl_duration:"Duración",dpl_add_todo:"+ Añadir tarea",
 dpl_duplicate:"Duplicar día",plan_duplicated:"Día duplicado ✓",
 // Invite
 invite_title:"Comparte FocusBlock 💫",
 invite_sub:"¡Completaste {n} sesiones! Comparte FocusBlock con amigos que quieran estudiar mejor.",
 invite_copy:"Copiar enlace",invite_copied:"¡Copiado!",invite_share:"Compartir",invite_dismiss:"Quizás luego",
 // Progress
 prog_open:"Progreso",prog_intro:"Tu progreso de estudio, todo en un lugar.",
 prog_tip_blocks:"Número total de sesiones de enfoque completadas.",
 prog_tip_focus:"Tiempo total que has pasado concentrado.",
 prog_tip_streak:"Días de estudio consecutivos. ¡Sigue así!",
 // Agenda
 agenda_title:"Agenda",agenda_back:"Atrás",agenda_add_exam:"+ Examen",
 agenda_exam_lbl:"Examen",agenda_plan_lbl:"Plan de estudio",agenda_no_events:"Sin eventos este día.",
 agenda_plan_day:"Planificar este día",agenda_edit_day:"Editar plan",
 exam_add_t:"Añadir examen",exam_subject:"Materia / Curso",exam_date:"Fecha",exam_time:"Hora (opcional)",exam_note:"Nota",
 exam_save:"Guardar",exam_delete:"Eliminar",
 agenda_today:"Hoy",agenda_days_left:"{n} días",agenda_tomorrow:"Mañana",
 agenda_plan_d:"Consulta tus fechas de examen y planifica tus días de estudio con antelación.",
 mot_1:"No necesitas estudiar todo el día. Unas pocas horas concentradas superan un día distraído.",
 mot_2:"Cada bloque que completas te acerca más. Sigue adelante.",
 mot_3:"Progreso, no perfección. Una sesión a la vez.",
 mot_4:"Estás construyendo algo real — bloque a bloque.",
 mot_5:"Empieza. Esa es siempre la parte más difícil.",
 tip_sleep:"😴 El sueño consolida lo que estudiaste. No lo saltes.",
 tip_pomodoro:"🍅 Las sesiones cortas y concentradas siempre superan las largas y dispersas.",
 tip_plan:"📋 Un plan claro reduce el estrés. Ya hiciste la parte difícil.",
 tip_break:"🚶 Camina durante tu descanso — eso restablece tu enfoque.",
 tip_phone:"📵 Teléfono boca abajo = menos interrupciones = más rápido.",
};
TR.ro = {
 back:"Înapoi",next:"Următorul",continue:"Continuă",done:"Gata",cancel:"Anulează",save:"Salvează",add:"Adaugă",skip:"Sari",
 home_greet_new:"Bine ai venit",home_greet:"Bine ai revenit, {name}",
 home_title_new:"Planifică-ți ziua.<br><em>Stăpânește-ți focusul.</em>",home_title:"Salut {name}.<br><em>Gata de focus?</em>",
 home_sub:"Alege cum vrei să începi. Nu trebuie să înveți toată ziua — câteva blocuri concentrate, bine făcute, sunt de ajuns.",
 home_foot:"Progresul tău e salvat doar pe acest dispozitiv. Fără cont, fără server.",
 home_empty_t:"Gata să începi?",home_empty_d:"Alege cum vrei să începi mai jos. <em>Start rapid</em> funcționează imediat — fără configurare.",
 card_quick_t:"Start rapid",card_quick_d:"Intră direct într-un bloc de focus. Fără setări.",card_quick_tag:"Cel mai rapid",
 card_plan_t:"Planifică-mi ziua",card_plan_d:"Construiește un plan complet: materii, durate și ordine.",card_plan_tag:"Control maxim",
 card_short_t:"Timp puțin",card_short_d:"Spune-mi materiile și timpul tău. Îți fac un plan rapid.",card_short_tag:"Inteligent",
 card_last_t:"Continuă planul",card_last_d:"Continuă de unde ai rămas.",card_last_tag:"",
 onb_lang_q:"Alege-ți <span>limba</span>",
 onb_name_q:"Întâi — care e <span>numele</span> tău?",name_ph:"Numele tău…",
 onb_subj_q:"Ce <span>materii</span> studiezi?",onb_subj_hint:"Adaugă materiile la care lucrezi. Vei alege dintre ele mai târziu — și poți scrie oricând altele noi.",subj_ph:"ex. Matematică, Franceză, Biologie…",
 onb_comp_q:"Alege un <span>companion de focus</span>",onb_comp_hint:"Un companion liniștit care reacționează la focusul tău. Complet opțional — rămâne discret.",
 onb_theme_q:"Alege-ți <span>stilul</span>",onb_theme_hint:"Poți schimba asta oricând în setări.",
 dur_q:"Cum vrei să <span>înveți</span> azi?",dur_hint:"Alege un ritm potrivit sarcinii — scurt pentru recapitulare, lung pentru înțelegere sau scris.",
 count_q:"Câte <span>sesiuni</span> azi?",count_hint:"Nu ai nevoie de multe. Câteva blocuri concentrate bat o zi întreagă distrasă.",
 sess_unit:"sesiuni",
 assign_q:"Care e <span>planul</span> pe sesiune?",assign_hint:"Alege o materie pe bloc, setează minutele, adaugă sarcini dacă vrei.",
 short_subj_q:"Ce trebuie să <span>termini</span>?",short_subj_hint:"Alege sau adaugă materiile de azi.",
 short_custom:"Personalizat",hours_short:"h",min_short:"min",short_time_q:"Cât <span>timp</span> ai?",short_time_hint:"Îți împart materiile în blocuri cu pauze.",
 minutes:"minute",hours:"ore",
 ready_q:"<span>Planul</span> tău e gata",
 ready_dur:"Durata sesiunii",ready_blocks:"Sesiuni azi",ready_total:"Focus total",ready_subj:"Materii",rec_badge:"Recomandat",
 begin:"Începe",
 pick_subject:"Alege o materie",custom_subject:"Scrie a ta…",no_subjects:"Încă nicio materie — adaugă mai sus.",
 add_task:"+ Adaugă sarcină",task_ph:"Sarcină mică…",note_ph:"Ce vei face exact?",note_lbl:"Notă",
 now:"Acum",phase_focus:"Focus",phase_short:"Pauză scurtă",phase_long:"Pauză lungă",
 ptab_focus:"Focus",ptab_short:"Pauză scurtă",ptab_long:"Pauză lungă",
 ends_at:"Se termină la",ep_start:"pornește cronometrul",ep_focus:"sfârșit sesiune",ep_break:"sfârșit pauză",
 restart:"Reia",skip_btn:"Sari",
 today_sessions:"Sesiunile de azi",add_session:"+ Adaugă",
 session_n:"Sesiunea {n}",break_word:"pauză",
 sess_of:"Sesiunea {a} din {b}",
 db_done:"{n} gata",db_focused:"{m} focus",
 break_short_msg:"Respiră puțin.",break_long_msg:"Ridică-te. Ai meritat-o.",
 m_ready:"Un bloc pe rând.",m_started:"Ai început. Asta-i partea grea.",m_quarter:"Prinzi avânt.",m_half:"La jumătate. Ține ritmul.",m_three:"Aproape — nu rupe acum.",m_near:"Termină puternic acest bloc.",
 pause_t:"Faci pauză?",pause_msg:"Ești la {min} minute. Încă {left} și acest bloc contează complet.",
 pause_t_en:"Faci pauză?",pause_continue:"Continuă",pause_pause:"Fă pauză oricum",
 skip_t:"Sari peste această sesiune?",skip_msg:"Nu va conta pentru sesiuni, serie sau construcție. Ești mai aproape decât crezi.",
 skip_continue:"Continuă",skip_confirm:"Sari oricum",
 leave_warn:"Ai o sesiune de focus în desfășurare. Pleci oricum?",
 reward_cheer:"Bravo.",reward_sub:"Te-ai concentrat {min} minute.",
 reward_block:"+1 cărămidă",reward_points:"+{n} puncte de focus",reward_build:"Construcția ta e la {pct}%.",
 reward_streak:"Serie de zile",reward_done:"Sesiuni gata",reward_focus:"Concentrat",
 reward_reflect:"Cum a mers?",
 reflect_well:"Bine",reflect_partial:"Parțial",reflect_struggled:"Greu",
 reward_next:"Urmează: {name}",reward_continue:"Continuă",reward_break_now:"Ia-ți pauza",
 recap_t:"Asta-i o zi.",recap_sub:"Fiecare sesiune gata. Muncă reală, concentrată.",
 recap_blocks:"{n} blocuri de focus",recap_time:"{t} studiat",recap_subj:"Studiat: {list}",
 recap_tomorrow:"Mâine",recap_tom_msg:"Începe cu {name} — păstrează avântul.",
 recap_close:"Gata pe azi",
 prog_title:"Progresul tău",prog_back:"Înapoi",
 prog_lifetime:"Total",lt_blocks:"Total sesiuni",lt_focus:"Total focus",lt_streak:"Serie de zile",
 prog_week:"Săptămâna asta",prog_subjects:"Timp pe materie",prog_village:"Satul tău de studiu",prog_companion:"Companionul tău",
 village_next:"<b>{n}</b> sesiun{s} până la {name}",village_max:"Ai construit tot. Continuă să-ți extinzi satul.",
 comp_lvl:"Nivel {n}",comp_grown:"Crescut prin {n} sesiuni de focus.",comp_unnamed:"Companionul tău",
 no_subj_data:"Termină câteva sesiuni ca să vezi defalcarea pe materii.",
 set_title:"Setări",settings_saved:"Setări salvate",
 tab_timer:"Cronometru",tab_appear:"Design",tab_comp:"Companion",tab_subjects:"Materii",tab_lang:"Limbă",tab_data:"Date",
 set_subj_l:"Materiile mele",set_subj_s:"Adaugă, redenumește sau elimină materii — apasă pe un nume pentru a-l redenumi.",
 subj_rename_tip:"Apasă pentru a redenumi",
 set_focus_l:"Timp de focus",set_focus_s:"Minute pe sesiune",
 set_short_l:"Pauză scurtă",set_short_s:"După fiecare sesiune",
 set_long_l:"Pauză lungă",set_long_s:"Odihna mai lungă",
 set_la_l:"Pauză lungă după",set_la_s:"Număr de sesiuni",
 set_layout_l:"Stilul cronometrului",set_layout_s:"Cum arată cronometrul tău",
 layout_ring:"Inel",layout_minimal:"Minimal",layout_card:"Card",
 set_sound_l:"Sunet de sesiune",set_sound_s:"Clopoțel la finalul unei sesiuni",
 sound_off:"Oprit",sound_soft:"Discret",sound_full:"Complet",
 set_theme_l:"Temă de accent",set_light_l:"Mod luminos",set_light_s:"Fundal luminos",
 set_anim_l:"Nivel de animație",set_anim_s:"Cât de vioi se simte",
 anim_minimal:"Minimal",anim_balanced:"Echilibrat",anim_expressive:"Expresiv",
 set_ambient_l:"Fundal ambiental",set_ambient_s:"Un decor calm în spatele cronometrului",
 amb_none:"Niciunul",amb_dark:"Birou întunecat",amb_rain:"Fereastră cu ploaie",amb_library:"Bibliotecă noaptea",amb_forest:"Pădure",amb_cream:"Crem minimal",amb_space:"Spațiu",
 set_bg_l:"Propria ta poză",set_bg_s:"Estompată pentru focus",set_bg_upload:"Încarcă poză",set_bg_clear:"Elimină",
 set_comp_type_l:"Companion",set_comp_name_l:"Nume",comp_name_ph:"ex. Pixel, Mugur, Biscuit…",
 set_comp_vis_l:"Când să apară",vis_focus:"În timpul focusului",vis_after:"După sesiuni",vis_prog:"Doar în progres",vis_off:"Oprit",
 set_comp_anim_l:"Expresivitate",set_comp_tone_l:"Stil de motivație",
 tone_calm:"Calm",tone_friendly:"Prietenos",tone_strict:"Strict",tone_gamer:"Gamer",tone_minimal:"Minimal",
 set_comp_sound_l:"Sunet companion",csound_off:"Oprit",csound_soft:"Discret",csound_reward:"Doar recompense",
 set_tips_l:"Sfaturi de bunăstare",set_tips_s:"Memento-uri blânde: bea apă, întinde-te, odihnește ochii",
 set_data_export:"Exportă progresul",set_data_export_s:"Salvează o copie de rezervă",
 set_data_import:"Importă progresul",set_data_import_s:"Încarcă dintr-o copie",
 set_data_reset:"Șterge tot",set_data_reset_s:"Șterge totul definitiv",
 export_btn:"Descarcă copia",import_btn:"Alege fișier",reset_btn:"Șterge tot",
 set_privacy:"FocusBlock salvează planul și progresul local în browser. Nimic nu se trimite la un server. Ștergerea datelor browserului le va elimina și nu se sincronizează între dispozitive.",
 reset_t:"Ștergi tot?",reset_msg:"Asta șterge definitiv numele, materiile, seria, istoricul și construcția. Ireversibil.",
 reset_cancel:"Anulează",reset_confirm:"Șterge tot",
 newday_t:"Începi o zi nouă?",newday_msg:"Asta șterge planul de azi. Seria, istoricul și construcția rămân salvate.",
 newday_cancel:"Continuă",newday_confirm:"Începe din nou",
 invalid_backup:"Acel fișier nu e o copie validă FocusBlock.",
 comp_plant:"Plantă de focus",comp_cat:"Pisică de birou",comp_dog:"Câine de studiu",comp_fire:"Licurici",comp_bot:"Robot constructor",comp_zen:"Piatră zen",comp_lamp:"Lampă de noapte",comp_none:"Niciunul",
 comp_plant_d:"Calm, natural, crește prin consecvență.",comp_cat_d:"Confortabil și liniștit la birou.",comp_dog_d:"Loial și stabil lângă tine.",comp_fire_d:"Lumini blânde care se adună.",comp_bot_d:"Îți construiește casa de studiu, bloc cu bloc.",comp_zen_d:"Ultra-minimal. Fără distrageri.",comp_lamp_d:"O lumină caldă ce devine mai puternică.",comp_none_d:"Niciun companion.",
 tip_water:"💧 Bea puțină apă.",tip_eyes:"👀 Privește în depărtare 20 de secunde.",tip_stretch:"🧍 Ridică-te și întinde-te.",tip_breath:"🌬️ Trei respirații lente.",tip_walk:"🚶 Mergi un minut.",tip_shoulder:"🙆 Rotește umerii spre spate.",
 vs_lot:"Teren gol",vs_tent:"Cort",vs_cabin:"Cabană mică",vs_house:"Casă de studiu",vs_library:"Bibliotecă",vs_cafe:"Cafenea",vs_village:"Sat de studiu",
 ready_at:"gata la",ready_approx:"gata ~",
 tasks_lbl:"Sarcini",drag_to_move:"Trage pentru a muta",break_recover:"Ia-ți un moment.",
 del_lbl:"Elimină",add_subj_btn:"+ Materie",quick_add_lbl:"Adaugă rapid",break_until:"pauză până la",
 start_at:"Începe la",
 // Home cards (new)
 card_blocks_t:"Blocuri rapide",card_blocks_d:"Adaugă blocuri de focus și începe imediat. Simplu și rapid.",card_blocks_tag:"Cel mai rapid",
 card_day_t:"Planificarea zilei",card_day_d:"Construiește-ți ziua de studiu completă cu ore, materii și to-do-uri.",card_day_tag:"Control complet",
 // Dagplanner
 dpl_title:"Planificarea zilei",dpl_sub:"Planifică-ți ziua de studiu fără stres.",
 dpl_start:"Start",dpl_until:"Până la",dpl_planned:"Planificat",dpl_done_by:"Gata la",
 dpl_quick_blocks:"Blocuri rapide",dpl_my_day:"Ziua mea",
 dpl_start_btn:"▶ Pornește planificarea",dpl_empty:"Adaugă blocuri pentru a-ți construi ziua.",
 dpl_add_focus_25:"25 min focus",dpl_add_focus_50:"50 min focus",dpl_add_pause_5:"5 min pauză",dpl_add_pause_15:"15 min pauză",dpl_add_custom:"Personalizat",
 dpl_block_detail:"Detalii bloc",dpl_what:"Ce vei face?",dpl_how:"Cum vei face?",
 dpl_type_focus:"Focus",dpl_type_pause:"Pauză",dpl_duration:"Durată",dpl_add_todo:"+ Adaugă sarcină",
 dpl_duplicate:"Duplică ziua",plan_duplicated:"Ziua duplicată ✓",
 // Invite
 invite_title:"Distribuie FocusBlock 💫",
 invite_sub:"Ai completat {n} sesiuni! Distribuie FocusBlock prietenilor care vor să studieze mai bine.",
 invite_copy:"Copiază linkul",invite_copied:"Copiat!",invite_share:"Distribuie",invite_dismiss:"Poate mai târziu",
 // Progress
 prog_open:"Progres",prog_intro:"Progresul tău de studiu, totul într-un loc.",
 prog_tip_blocks:"Numărul total de sesiuni de focus completate.",
 prog_tip_focus:"Timpul total petrecut concentrat.",
 prog_tip_streak:"Zile consecutive de studiu. Continuă!",
 // Agenda
 agenda_title:"Agendă",agenda_back:"Înapoi",agenda_add_exam:"+ Examen",
 agenda_exam_lbl:"Examen",agenda_plan_lbl:"Plan de studiu",agenda_no_events:"Niciun eveniment în această zi.",
 agenda_plan_day:"Planifică ziua",agenda_edit_day:"Editează planul",
 exam_add_t:"Adaugă examen",exam_subject:"Materie / Curs",exam_date:"Dată",exam_time:"Oră (opțional)",exam_note:"Notă",
 exam_save:"Salvează",exam_delete:"Elimină",
 agenda_today:"Azi",agenda_days_left:"{n} zile",agenda_tomorrow:"Mâine",
 agenda_plan_d:"Vezi datele examenelor tale și planifică zile de studiu în avans.",
 mot_1:"Nu trebuie să înveți toată ziua. Câteva ore concentrate bat o zi întreagă distrasă.",
 mot_2:"Fiecare bloc terminat te apropie mai mult. Continuă.",
 mot_3:"Progres, nu perfecție. O sesiune pe rând.",
 mot_4:"Construiești ceva real — bloc cu bloc.",
 mot_5:"Începe. Asta e întotdeauna partea cea mai grea.",
 tip_sleep:"😴 Somnul consolidează ce ai studiat. Nu-l sări.",
 tip_pomodoro:"🍅 Sesiunile scurte și concentrate bat mereu pe cele lungi și nefocusate.",
 tip_plan:"📋 Un plan clar reduce stresul. Ai făcut deja partea grea.",
 tip_break:"🚶 Mergi puțin în pauză — îți resetează focusul.",
 tip_phone:"📵 Telefon cu fața în jos = mai puține întreruperi = mai repede gata.",
};

/* ---- translate helpers ---- */
function T(k){ const l = TR[S.lang] || TR.en; return (l[k] !== undefined ? l[k] : (TR.en[k] !== undefined ? TR.en[k] : k)); }
function Tf(k, vars){ let s = T(k); for(const v in vars) s = s.replaceAll('{'+v+'}', vars[v]); return s; }

/* ══════════════════════════════════════════════════════
   DURATION PRESETS (per language)
   ══════════════════════════════════════════════════════ */
const DUR_RAW = {
 en:[
  [25,5,'25 / 5 · Sprint','Vocabulary, flashcards & quick starts','Short bursts for memorising — vocab, definitions, formulas. Great when motivation is low.'],
  [40,8,'40 / 8 · Practice','Exercises & past-paper questions','Long enough to get in, short enough to stay fresh. Best for solving problems.'],
  [50,10,'50 / 10 · Deep study','Theory, chapters & summaries','The all-rounder for most study days — reading, understanding, summarising.'],
  [60,15,'60 / 15 · Heavy','Hard subjects & big chapters','For dense material that needs deep focus. Not when you\'re tired or just starting.'],
  [90,20,'90 / 20 · Flow','Essays, projects & mock exams','For long tasks where stopping breaks your flow. Only if you can sustain it.'],
 ],
 nl:[
  [25,5,'25 / 5 · Sprint','Woordjes, flashcards & snel starten','Korte bursts om te memoriseren — woordenschat, definities, formules. Ideaal bij weinig motivatie.'],
  [40,8,'40 / 8 · Oefenen','Oefeningen & examenvragen','Lang genoeg om erin te komen, kort genoeg om fris te blijven. Top voor oefeningen maken.'],
  [50,10,'50 / 10 · Diep','Theorie, hoofdstukken & samenvatten','De allrounder voor de meeste studiedagen — lezen, begrijpen, samenvatten.'],
  [60,15,'60 / 15 · Zwaar','Moeilijke vakken & grote hoofdstukken','Voor dicht materiaal dat diepe focus vraagt. Niet als je moe bent of net begint.'],
  [90,20,'90 / 20 · Flow','Essays, projecten & proefexamens','Voor lange taken waar stoppen je flow breekt. Alleen als je het vol kan houden.'],
 ],
 fr:[
  [25,5,'25 / 5 · Sprint','Vocabulaire, flashcards & démarrage','Courtes rafales pour mémoriser — vocabulaire, définitions, formules. Idéal quand la motivation manque.'],
  [40,8,'40 / 8 · Pratique','Exercices & annales','Assez long pour entrer, assez court pour rester frais. Idéal pour les exercices.'],
  [50,10,'50 / 10 · Profond','Théorie, chapitres & résumés','Le polyvalent pour la plupart des journées — lire, comprendre, résumer.'],
  [60,15,'60 / 15 · Intense','Matières difficiles & gros chapitres','Pour du dense qui demande une concentration profonde. Pas quand tu es fatigué.'],
  [90,20,'90 / 20 · Flow','Dissertations, projets & examens blancs','Pour les longues tâches où s\'arrêter casse l\'élan. Seulement si tu tiens.'],
 ],
 es:[
  [25,5,'25 / 5 · Sprint','Vocabulario, tarjetas & arrancar','Ráfagas cortas para memorizar — vocabulario, definiciones, fórmulas. Ideal con poca motivación.'],
  [40,8,'40 / 8 · Práctica','Ejercicios & exámenes pasados','Suficiente para entrar, corto para mantenerte fresco. Mejor para resolver ejercicios.'],
  [50,10,'50 / 10 · Profundo','Teoría, capítulos & resúmenes','El todoterreno para la mayoría de días — leer, entender, resumir.'],
  [60,15,'60 / 15 · Intenso','Materias difíciles & capítulos grandes','Para material denso que necesita foco profundo. No si estás cansado.'],
  [90,20,'90 / 20 · Flow','Redacciones, proyectos & simulacros','Para tareas largas donde parar rompe el flujo. Solo si puedes mantenerlo.'],
 ],
 ro:[
  [25,5,'25 / 5 · Sprint','Vocabular, flashcard-uri & start rapid','Reprize scurte pentru memorare — vocabular, definiții, formule. Ideal când motivația e scăzută.'],
  [40,8,'40 / 8 · Practică','Exerciții & subiecte vechi','Suficient cât să intri, scurt cât să rămâi proaspăt. Bun pentru exerciții.'],
  [50,10,'50 / 10 · Profund','Teorie, capitole & rezumate','Universalul pentru majoritatea zilelor — citit, înțeles, rezumat.'],
  [60,15,'60 / 15 · Intens','Materii grele & capitole mari','Pentru material dens ce cere focus profund. Nu când ești obosit.'],
  [90,20,'90 / 20 · Flow','Eseuri, proiecte & examene simulate','Pentru sarcini lungi unde oprirea rupe ritmul. Doar dacă poți susține.'],
 ],
};
function getDurs(){
  const arr = DUR_RAW[S.lang] || DUR_RAW.en;
  return arr.map(d => ({min:d[0], brk:d[1], name:d[2], tag:d[3], desc:d[4], rec:d[0]===50}));
}

/* ---- themes ---- */
const THEMES = [
 {id:'lime',a:'#c8f060',cls:'',n:'Lime'},{id:'sage',a:'#6ee7b7',cls:'t-sage',n:'Sage'},
 {id:'sky',a:'#67e8f9',cls:'t-sky',n:'Sky'},{id:'violet',a:'#c084fc',cls:'t-violet',n:'Violet'},
 {id:'rose',a:'#fb7185',cls:'t-rose',n:'Rose'},{id:'amber',a:'#fcd34d',cls:'t-amber',n:'Amber'},
 {id:'warm',a:'#f0a868',cls:'t-warm',n:'Warm'},
];
function themeCls(id){ return THEMES.find(t => t.id === id)?.cls || ''; }

/* ---- ambient background presets ---- */
const AMBIENTS = {
 none:'',
 dark:'radial-gradient(ellipse at 30% 20%,#1c1c1a,transparent 60%),linear-gradient(160deg,#0d0d0c,#161614)',
 rain:'linear-gradient(180deg,#0a1018,#10161f),repeating-linear-gradient(105deg,rgba(120,160,200,0.04) 0 2px,transparent 2px 9px)',
 library:'radial-gradient(ellipse at 70% 30%,#231a12,transparent 55%),linear-gradient(160deg,#15110c,#0d0a07)',
 forest:'radial-gradient(ellipse at 25% 80%,#10241a,transparent 60%),linear-gradient(160deg,#0a1410,#0c1a13)',
 cream:'linear-gradient(160deg,#f3ecdd,#e9e0cc)',
 space:'radial-gradient(ellipse at 50% 0%,#1a1530,transparent 55%),radial-gradient(circle at 80% 70%,#0f1d2e,transparent 50%),#07060f',
};

/* ══════════════════════════════════════════════════════
   SVG ART — companions (clean line illustrations) + village
   state: 'idle' | 'active' | 'done'   acc = accent color
   ══════════════════════════════════════════════════════ */
function compMeta(){ return [
 {id:'plant',k:'comp_plant',dk:'comp_plant_d'},
 {id:'cat',k:'comp_cat',dk:'comp_cat_d'},
 {id:'dog',k:'comp_dog',dk:'comp_dog_d'},
 {id:'fire',k:'comp_fire',dk:'comp_fire_d'},
 {id:'bot',k:'comp_bot',dk:'comp_bot_d'},
 {id:'zen',k:'comp_zen',dk:'comp_zen_d'},
 {id:'lamp',k:'comp_lamp',dk:'comp_lamp_d'},
 {id:'none',k:'comp_none',dk:'comp_none_d'},
];}

function companionSVG(id, state, acc, lvl){
  acc = acc || getCSS('--accent'); lvl = lvl || 0; state = state || 'idle';
  const mid = getCSS('--mid') || '#9a9790';
  const bg2 = getCSS('--bg2') || '#1a1a18';
  const ink = getCSS('--text') || '#ece9e2';
  const dim = (c,f) => { try { const h=c.replace('#',''); const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16); const m=(x)=>Math.round(x*f); return `rgb(${m(r)},${m(g)},${m(b)})`; } catch(e){ return c; } };
  const lite = (c,f) => { try { const h=c.replace('#',''); const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16); const m=(x)=>Math.round(x+(255-x)*f); return `rgb(${m(r)},${m(g)},${m(b)})`; } catch(e){ return c; } };
  const dark = dim(acc,0.62), deep = dim(acc,0.42), soft = lite(acc,0.35);
  const uid = 'c' + Math.random().toString(36).slice(2,7);
  const breathe = state==='active' ? `<animateTransform attributeName="transform" type="scale" values="1;1.045;1" dur="3.6s" repeatCount="indefinite" additive="sum"/>` : '';
  const bob = state==='active' ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -2.2;0 0" dur="3.6s" repeatCount="indefinite" additive="sum"/>` : '';
  const glow = state==='done' ? `<circle cx="50" cy="52" r="44" fill="${acc}" opacity="0.14"><animate attributeName="opacity" values="0.06;0.2;0.06" dur="2.2s" repeatCount="indefinite"/></circle>` : '';
  const shadow = `<ellipse cx="50" cy="90" rx="${id==='fire'?26:22}" ry="4.5" fill="#000" opacity="0.18"/>`;
  let defs = `<radialGradient id="${uid}g" cx="0.4" cy="0.3" r="0.9"><stop offset="0" stop-color="${soft}"/><stop offset="0.55" stop-color="${acc}"/><stop offset="1" stop-color="${deep}"/></radialGradient>`;
  let body = '';

  if(id==='plant'){
    const sway = state==='active' ? `<animateTransform attributeName="transform" type="rotate" values="-2 50 78;2 50 78;-2 50 78" dur="4.2s" repeatCount="indefinite"/>` : '';
    const leafL = `<path d="M50 74 C36 70 26 58 26 44 C40 46 50 56 50 74 Z" fill="url(#${uid}g)"/><path d="M50 74 C42 66 36 56 33 47" stroke="${dark}" stroke-width="1.6" fill="none" opacity="0.5" stroke-linecap="round"/>`;
    const leafR = `<path d="M50 74 C64 70 74 58 74 44 C60 46 50 56 50 74 Z" fill="${acc}"/><path d="M50 74 C58 66 64 56 67 47" stroke="${dark}" stroke-width="1.6" fill="none" opacity="0.45" stroke-linecap="round"/>`;
    const leafC = `<path d="M50 76 C46 60 50 44 50 34 C54 44 56 60 50 76 Z" fill="url(#${uid}g)"/>`;
    const bud = `<g><circle cx="50" cy="30" r="7" fill="${soft}"/><circle cx="50" cy="30" r="7" fill="none" stroke="${dark}" stroke-width="1.4" opacity="0.4"/><circle cx="47" cy="27" r="2.4" fill="#fff" opacity="0.6"/></g>`;
    let plant = leafL+leafR; if(lvl>=2)plant=leafL+leafR+leafC; if(lvl>=4)plant=leafL+leafR+leafC+bud;
    const face = state==='active' ? `<g><path d="M44 60 Q46 62.5 48 60" stroke="${dark}" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M52 60 Q54 62.5 56 60" stroke="${dark}" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M46 65 Q50 68 54 65" stroke="${dark}" stroke-width="1.8" fill="none" stroke-linecap="round"/></g>` : `<g><circle cx="46" cy="61" r="1.6" fill="${dark}"/><circle cx="54" cy="61" r="1.6" fill="${dark}"/></g>`;
    body = `${shadow}<g transform="translate(0 2)">${bob}<g>${sway}${plant}</g><path d="M37 74 L63 74 L59 88 Q50 92 41 88 Z" fill="${bg2}" stroke="${mid}" stroke-width="2.2" stroke-linejoin="round"/><path d="M35 73 L65 73 L64 78 L36 78 Z" fill="${deep}" opacity="0.9"/><rect x="35" y="72.5" width="30" height="2.5" rx="1.2" fill="${mid}" opacity="0.5"/>${face}</g>`;
  }
  else if(id==='cat'){
    const tail = state==='active' ? `<path d="M72 70 Q88 66 84 48" stroke="${acc}" stroke-width="6" fill="none" stroke-linecap="round"><animate attributeName="d" values="M72 70 Q88 66 84 48;M72 70 Q90 70 88 52;M72 70 Q88 66 84 48" dur="2.8s" repeatCount="indefinite"/></path>` : `<path d="M72 70 Q86 68 83 52" stroke="${acc}" stroke-width="6" fill="none" stroke-linecap="round"/>`;
    const eyes = state==='active' ? `<path d="M40 50 Q43.5 46.5 47 50" stroke="${dark}" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M53 50 Q56.5 46.5 60 50" stroke="${dark}" stroke-width="2.6" fill="none" stroke-linecap="round"/>` : `<ellipse cx="43.5" cy="50" rx="2.8" ry="3.4" fill="${dark}"/><ellipse cx="56.5" cy="50" rx="2.8" ry="3.4" fill="${dark}"/><circle cx="44.5" cy="49" r="1" fill="#fff" opacity="0.8"/><circle cx="57.5" cy="49" r="1" fill="#fff" opacity="0.8"/>`;
    body = `${shadow}<g transform="translate(0 1)">${bob}${tail}<g>${breathe}
      <path d="M32 40 L28 24 L43 36 Z" fill="${acc}"/><path d="M68 40 L72 24 L57 36 Z" fill="${acc}"/>
      <path d="M34 38 L31.5 28 L40 35 Z" fill="${soft}"/><path d="M66 38 L68.5 28 L60 35 Z" fill="${soft}"/>
      <ellipse cx="50" cy="56" rx="24" ry="21" fill="url(#${uid}g)"/>
      <ellipse cx="50" cy="56" rx="24" ry="21" fill="none" stroke="${dark}" stroke-width="1.6" opacity="0.35"/>
      ${eyes}
      <path d="M50 57 L47 61 L53 61 Z" fill="${dark}"/>
      <path d="M50 61 Q50 65 46 65 M50 61 Q50 65 54 65" stroke="${dark}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <g opacity="0.55" stroke="${dark}" stroke-width="1.1" stroke-linecap="round"><path d="M36 56 L24 54"/><path d="M36 59 L25 60"/><path d="M64 56 L76 54"/><path d="M64 59 L75 60"/></g>
      </g></g>`;
  }
  else if(id==='dog'){
    const tail = state==='active' ? `<path d="M73 66 Q86 60 82 46" stroke="${acc}" stroke-width="6" fill="none" stroke-linecap="round"><animate attributeName="d" values="M73 66 Q86 60 82 46;M73 66 Q90 66 90 50;M73 66 Q86 60 82 46" dur="0.9s" repeatCount="indefinite"/></path>` : `<path d="M73 66 Q85 62 81 50" stroke="${acc}" stroke-width="6" fill="none" stroke-linecap="round"/>`;
    const tongue = state==='active' ? `<path d="M50 66 Q50 73 54 72 Q56 71 55 66 Z" fill="#fb7185"/>` : '';
    const eyes = `<ellipse cx="43" cy="49" rx="2.9" ry="3.4" fill="${dark}"/><ellipse cx="57" cy="49" rx="2.9" ry="3.4" fill="${dark}"/><circle cx="44" cy="48" r="1.1" fill="#fff" opacity="0.85"/><circle cx="58" cy="48" r="1.1" fill="#fff" opacity="0.85"/>`;
    body = `${shadow}<g transform="translate(0 1)">${bob}${tail}<g>${breathe}
      <path d="M30 40 Q20 42 22 60 Q24 70 34 60 Z" fill="${deep}"/><path d="M70 40 Q80 42 78 60 Q76 70 66 60 Z" fill="${deep}"/>
      <ellipse cx="50" cy="54" rx="23" ry="20" fill="url(#${uid}g)"/>
      <ellipse cx="50" cy="54" rx="23" ry="20" fill="none" stroke="${dark}" stroke-width="1.6" opacity="0.3"/>
      <path d="M38 58 Q50 70 62 58 Q60 48 50 48 Q40 48 38 58 Z" fill="${soft}" opacity="0.55"/>
      ${eyes}
      <ellipse cx="50" cy="60" rx="4.5" ry="3.4" fill="${dark}"/><circle cx="48.5" cy="59" r="1.2" fill="#fff" opacity="0.7"/>
      ${tongue}
      </g></g>`;
  }
  else if(id==='fire'){
    const n = state==='done' ? 9 : state==='active' ? 6 : 3;
    let dots = '';
    for(let i=0; i<n; i++){
      const a = (i/n)*6.28+i; const rr = 8+((i*7)%14);
      const x = 50+Math.cos(a)*rr; const y = 52+Math.sin(a*1.3)*rr*0.8;
      const d = (1.6+(i%3))/1;
      dots += `<g><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="${soft}" opacity="0.5"><animate attributeName="opacity" values="0.05;0.5;0.05" dur="${d}s" repeatCount="indefinite" begin="${(i*0.3).toFixed(1)}s"/></circle><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="#fff"><animate attributeName="opacity" values="0.2;1;0.2" dur="${d}s" repeatCount="indefinite" begin="${(i*0.3).toFixed(1)}s"/></circle></g>`;
    }
    body = `${shadow}<g transform="translate(0 1)">${bob}
      <path d="M40 26 L60 26 L60 32 L40 32 Z" fill="${mid}" opacity="0.5"/>
      <rect x="42" y="22" width="16" height="6" rx="2" fill="${mid}" opacity="0.7"/>
      <path d="M34 34 Q34 30 40 30 L60 30 Q66 30 66 34 L66 78 Q66 86 58 86 L42 86 Q34 86 34 78 Z" fill="${acc}" opacity="0.10"/>
      <path d="M34 34 Q34 30 40 30 L60 30 Q66 30 66 34 L66 78 Q66 86 58 86 L42 86 Q34 86 34 78 Z" fill="none" stroke="${mid}" stroke-width="2.2"/>
      <path d="M38 36 L38 80" stroke="#fff" stroke-width="2" opacity="0.18" stroke-linecap="round"/>
      ${dots}</g>`;
  }
  else if(id==='bot'){
    const armR = state==='active' ? `<g><rect x="64" y="54" width="6" height="14" rx="3" fill="${deep}"><animateTransform attributeName="transform" type="rotate" values="0 67 54;-26 67 54;0 67 54" dur="1.5s" repeatCount="indefinite"/></rect></g>` : `<rect x="64" y="54" width="6" height="13" rx="3" fill="${deep}"/>`;
    const eyes = state==='active' ? `<rect x="40" y="44" width="7" height="3.2" rx="1.6" fill="${dark}"/><rect x="53" y="44" width="7" height="3.2" rx="1.6" fill="${dark}"/>` : `<circle cx="43.5" cy="46" r="3.4" fill="${dark}"/><circle cx="56.5" cy="46" r="3.4" fill="${dark}"/><circle cx="44.5" cy="45" r="1.1" fill="#fff" opacity="0.8"/><circle cx="57.5" cy="45" r="1.1" fill="#fff" opacity="0.8"/>`;
    let blocks2 = ''; const bn = Math.min(3,lvl);
    for(let i=0; i<bn; i++){ blocks2 += `<rect x="${40+i*7}" y="${80-((i%2)*0)}" width="6" height="6" rx="1.4" fill="${acc}" opacity="${0.5+i*0.16}"/>`; }
    body = `${shadow}<g transform="translate(0 1)">${bob}
      <line x1="50" y1="28" x2="50" y2="22" stroke="${mid}" stroke-width="2.4"/><circle cx="50" cy="20" r="3.4" fill="${acc}"><animate attributeName="opacity" values="0.4;1;0.4" dur="1.4s" repeatCount="indefinite"/></circle>
      <rect x="30" y="56" width="6" height="13" rx="3" fill="${deep}"/>${armR}
      <rect x="33" y="30" width="34" height="32" rx="9" fill="url(#${uid}g)"/>
      <rect x="33" y="30" width="34" height="32" rx="9" fill="none" stroke="${dark}" stroke-width="1.6" opacity="0.4"/>
      <rect x="38" y="40" width="24" height="14" rx="5" fill="${bg2}" opacity="0.92"/>
      ${eyes}<path d="M45 51 Q50 53.5 55 51" stroke="${dark}" stroke-width="1.8" fill="none" stroke-linecap="round" opacity="0.7"/>
      <rect x="40" y="63" width="20" height="13" rx="4" fill="${deep}"/>
      <rect x="44" y="66" width="12" height="3" rx="1.5" fill="${soft}" opacity="0.6"/>
      ${blocks2}</g>`;
  }
  else if(id==='zen'){
    const ripple = state==='active' ? `<ellipse cx="50" cy="84" rx="20" ry="5" fill="none" stroke="${acc}" stroke-width="1.4" opacity="0.4"><animate attributeName="rx" values="14;26;14" dur="4s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.5;0;0.5" dur="4s" repeatCount="indefinite"/></ellipse>` : '';
    body = `${shadow}${ripple}<g transform="translate(0 1)">${breathe}
      <ellipse cx="50" cy="78" rx="22" ry="9" fill="url(#${uid}g)"/><ellipse cx="50" cy="76" rx="22" ry="9" fill="${acc}"/><path d="M30 76 A22 9 0 0 0 70 76" fill="${dark}" opacity="0.25"/>
      <ellipse cx="50" cy="62" rx="16" ry="7" fill="${soft}"/><ellipse cx="50" cy="60.5" rx="16" ry="7" fill="${acc}"/><path d="M35 61 A16 7 0 0 0 65 61" fill="${dark}" opacity="0.22"/>
      <ellipse cx="50" cy="48" rx="11" ry="5.5" fill="${soft}"/><ellipse cx="50" cy="46.5" rx="11" ry="5.5" fill="${acc}"/>
      <circle cx="46" cy="45" r="1.6" fill="#fff" opacity="0.55"/></g>`;
  }
  else if(id==='lamp'){
    const li = state==='idle' ? 0.16 : state==='active' ? 0.42 : 0.72;
    const cone = `<path d="M50 40 L30 80 L70 80 Z" fill="${acc}" opacity="${li*0.5}"><animate attributeName="opacity" values="${(li*0.4).toFixed(2)};${(li*0.6).toFixed(2)};${(li*0.4).toFixed(2)}" dur="4s" repeatCount="indefinite"/></path>`;
    body = `${shadow}${cone}<g transform="translate(0 1)">
      <circle cx="50" cy="40" r="13" fill="${acc}" opacity="${li}"><animate attributeName="opacity" values="${li};${(li+0.12).toFixed(2)};${li}" dur="3.4s" repeatCount="indefinite"/></circle>
      <path d="M37 34 Q50 22 63 34 L60 46 L40 46 Z" fill="url(#${uid}g)" stroke="${dark}" stroke-width="1.6" stroke-linejoin="round"/>
      <ellipse cx="50" cy="46" rx="11" ry="3" fill="${soft}"/>
      <path d="M50 46 Q52 62 60 70" stroke="${mid}" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M44 84 Q50 76 64 72 Q66 80 60 84 Z" fill="${deep}" stroke="${mid}" stroke-width="1.6" stroke-linejoin="round"/>
      <circle cx="50" cy="40" r="2.4" fill="#fff" opacity="${Math.min(1,li+0.4).toFixed(2)}"/></g>`;
  }
  else { return ''; }
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs>${glow}${body}</svg>`;
}

/* ---- VILLAGE — stages grow with houseProgress ---- */
const VILLAGE_STAGES = [
 {at:0,k:'vs_lot'},{at:10,k:'vs_tent'},{at:25,k:'vs_cabin'},
 {at:50,k:'vs_house'},{at:100,k:'vs_library'},{at:200,k:'vs_cafe'},{at:500,k:'vs_village'}
];
function villageStageIdx(p){ let i=0; for(let s=0;s<VILLAGE_STAGES.length;s++){ if(p>=VILLAGE_STAGES[s].at)i=s; } return i; }

function villageSVG(p){
  const acc = getCSS('--accent'), mid = getCSS('--mid'), bg2 = getCSS('--bg2');
  const idx = villageStageIdx(p);
  const sky = `<defs><linearGradient id="vsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${acc}" stop-opacity="0.10"/><stop offset="1" stop-color="${acc}" stop-opacity="0"/></linearGradient></defs><rect x="0" y="0" width="400" height="230" fill="url(#vsky)"/>`;
  const ground = `<path d="M0 175 Q120 165 200 172 T400 170 L400 230 L0 230 Z" fill="${mid}" opacity="0.10"/><line x1="0" y1="176" x2="400" y2="172" stroke="${mid}" stroke-width="1.5" opacity="0.3"/>`;
  let stars = '';
  if(idx>=4){ for(let i=0;i<14;i++){ const x=20+Math.random()*360,y=18+Math.random()*90; stars+=`<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(0.8+Math.random()).toFixed(1)}" fill="${acc}" opacity="0.5"><animate attributeName="opacity" values="0.2;0.7;0.2" dur="${(2+Math.random()*2).toFixed(1)}s" repeatCount="indefinite"/></circle>`; } }
  const pathEl = `<path d="M30 230 Q60 195 110 185 T230 178 T370 175" stroke="${acc}" stroke-width="3" fill="none" stroke-dasharray="2 8" stroke-linecap="round" opacity="0.4"/>`;
  function tent(x,s){ s=s||1; return `<g transform="translate(${x},150) scale(${s})"><path d="M0 25 L18 -8 L36 25 Z" fill="none" stroke="${mid}" stroke-width="2.5" stroke-linejoin="round"/><path d="M18 -8 L18 25" stroke="${acc}" stroke-width="2"/><path d="M12 25 L18 12 L24 25" fill="${acc}" opacity="0.3"/></g>`; }
  function cabin(x,s){ s=s||1; return `<g transform="translate(${x},140) scale(${s})"><rect x="0" y="14" width="40" height="24" fill="none" stroke="${mid}" stroke-width="2.5"/><path d="M-4 14 L20 -2 L44 14 Z" fill="none" stroke="${mid}" stroke-width="2.5" stroke-linejoin="round"/><rect x="15" y="24" width="10" height="14" fill="${acc}" opacity="0.5"/><rect x="5" y="18" width="7" height="6" fill="${acc}" opacity="0.35"/></g>`; }
  function house(x,s){ s=s||1; return `<g transform="translate(${x},128) scale(${s})"><rect x="0" y="18" width="50" height="32" fill="none" stroke="${mid}" stroke-width="2.5"/><path d="M-5 18 L25 -4 L55 18 Z" fill="none" stroke="${mid}" stroke-width="2.5" stroke-linejoin="round"/><rect x="19" y="32" width="12" height="18" fill="${acc}" opacity="0.5"/><rect x="6" y="24" width="9" height="8" fill="${acc}" opacity="0.35"/><rect x="35" y="24" width="9" height="8" fill="${acc}" opacity="0.35"/><rect x="34" y="-2" width="6" height="12" fill="${mid}" opacity="0.5"/></g>`; }
  function lib(x,s){ s=s||1; return `<g transform="translate(${x},120) scale(${s})"><rect x="0" y="14" width="64" height="44" fill="none" stroke="${mid}" stroke-width="2.5"/><path d="M-4 14 L32 -6 L68 14 Z" fill="none" stroke="${mid}" stroke-width="2.5" stroke-linejoin="round"/><line x1="10" y1="14" x2="10" y2="58" stroke="${mid}" stroke-width="1.5" opacity="0.5"/><line x1="54" y1="14" x2="54" y2="58" stroke="${mid}" stroke-width="1.5" opacity="0.5"/><rect x="26" y="40" width="14" height="18" fill="${acc}" opacity="0.5"/><circle cx="32" cy="6" r="3" fill="${acc}"/></g>`; }
  function cafe(x,s){ s=s||1; return `<g transform="translate(${x},134) scale(${s})"><rect x="0" y="10" width="46" height="30" fill="none" stroke="${mid}" stroke-width="2.5"/><path d="M0 10 L46 10 L46 4 L0 4 Z" fill="${acc}" opacity="0.4"/><path d="M0 4 q5 -6 11 0 q5 -6 11 0 q5 -6 11 0 q5 -6 11 0" fill="none" stroke="${mid}" stroke-width="1.5"/><rect x="8" y="22" width="10" height="18" fill="${acc}" opacity="0.45"/><rect x="28" y="20" width="10" height="9" fill="${acc}" opacity="0.3"/></g>`; }
  let scene = '';
  if(idx===0){ scene=`<text x="200" y="120" text-anchor="middle" fill="${mid}" font-family="DM Mono,monospace" font-size="13" opacity="0.5">…</text>`; }
  else if(idx===1){ scene=tent(180); }
  else if(idx===2){ scene=tent(120,0.8)+cabin(190); }
  else if(idx===3){ scene=tent(70,0.7)+cabin(140,0.85)+house(220); }
  else if(idx===4){ scene=tent(40,0.6)+cabin(95,0.7)+house(160,0.85)+lib(240); }
  else if(idx===5){ scene=tent(25,0.55)+cabin(75,0.6)+house(130,0.7)+lib(200,0.85)+cafe(290,0.9); }
  else {
    const extra = Math.min(4,Math.floor((p-500)/120));
    scene = tent(20,0.5)+cabin(60,0.55)+house(110,0.62)+house(175,0.55)+lib(225,0.7)+cafe(305,0.75);
    for(let i=0; i<extra; i++) scene += house(30+i*40,0.4);
  }
  return `<svg viewBox="0 0 400 230" xmlns="http://www.w3.org/2000/svg">${sky}${stars}${ground}${pathEl}${scene}</svg>`;
}
