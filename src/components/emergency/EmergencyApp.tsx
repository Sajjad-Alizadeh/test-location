"use client";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { DEMO_CENTER, demoAddress } from "@/lib/location/demo";
import { freshFix } from "@/lib/location/engine";
import { distance, inIran } from "@/lib/location/geometry";
import { initialState, reducer } from "@/lib/location/machine";
import { ApiError, getSession, reverseGeocode, searchPlaces, sendLocation, submissionKey } from "@/lib/location/services";
import type { DispatchPayload, Point, SearchResult, Session } from "@/lib/location/types";
import { useLocationAcquisition } from "@/lib/location/use-location";
import { Icon } from "./Icon";
import { LocationMap } from "./LocationMap";
import { PermissionHelp } from "./PermissionHelp";

const labels = {
  ready: "محل خود را پیدا کنید", requesting: "برای پیدا کردن محل، اجازه دسترسی بدهید", calibrating: "در حال پیدا کردن محل شما…",
  locked: "موقعیت شما با دقت ثبت شد", manual: "محل انتخاب‌شده را بررسی کنید", submitting: "در حال ارسال موقعیت…", submitted: "موقعیت شما دریافت شد", critical: "این لینک قابل استفاده نیست",
};
export function EmergencyApp({ demo = false }: { demo?: boolean }) {
  const [state, emit] = useReducer(reducer, demo ? { ...initialState, phase: "manual", fix: { ...DEMO_CENTER, accuracy: null, source: "manual", timestamp: 0 } } : initialState);
  const [manualCenter, setCenter] = useState<Point>(demo ? DEMO_CENTER : { lat: 32.4279, lng: 53.688 });
  const [manualZoom, setZoom] = useState(demo ? 16 : 5);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!demo);
  const [online, setOnline] = useState(true);
  const [help, setHelp] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchMessage, setSearchMessage] = useState("");
  const [searching, setSearching] = useState(false);
  const [address, setAddress] = useState(demo ? demoAddress(DEMO_CENTER) : "");
  const [addressPoint, setAddressPoint] = useState<Point | null>(demo ? DEMO_CENTER : null);
  const [addressStatus, setAddressStatus] = useState<"loading" | "ready" | "missing">(demo ? "ready" : "missing");
  const [details, setDetails] = useState("");
  const [patientAddress, setPatientAddress] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [submittedAttempt, setSubmittedAttempt] = useState(false);
  const [networkRetry, setNetworkRetry] = useState(0);
  const [now, setNow] = useState(0);
  const manuallyEdited = useRef(false);
  const gpsSeen = useRef(false);
  const startupComplete = useRef(false);
  const sending = useRef(false);
  const frozenSubmission = useRef<{ key: string; payload: DispatchPayload } | null>(null);
  const block = useCallback(() => setHelp(true), []);
  const acquire = useCallback((event: Parameters<typeof emit>[0]) => {
    if (event.type === "SAMPLE") gpsSeen.current = true;
    emit(event);
  }, []);
  const { start, stop } = useLocationAcquisition(acquire, block);
  const expired = !!session && now >= session.expiresAt && state.phase !== "submitted";
  const authorized = demo || !!session;
  const center = useMemo(() => state.fix?.source === "gps" ? { lat: state.fix.lat, lng: state.fix.lng } : manualCenter, [state.fix, manualCenter]);
  const zoom = state.fix?.source === "gps" ? 17 : manualZoom;
  const busy = state.phase === "submitting" || state.phase === "submitted" || state.phase === "critical" || expired || loading;
  const located = !!state.fix;
  const addressMatches = !!addressPoint && (state.fix?.source === "gps" ? distance(addressPoint, center) <= 10 : addressPoint.lat === center.lat && addressPoint.lng === center.lng);
  const currentAddress = patientAddress.trim() || (addressMatches ? address : "");

  useEffect(() => {
    const connection = () => setOnline(navigator.onLine);
    connection();
    window.addEventListener("online", connection); window.addEventListener("offline", connection);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { window.removeEventListener("online", connection); window.removeEventListener("offline", connection); clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (demo) return;
    let active = true;
    const openNewToken = () => { if (new URLSearchParams(window.location.hash.slice(1)).has("token")) window.location.reload(); };
    window.addEventListener("hashchange", openNewToken);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token") || undefined;
    async function boot() {
      try {
        const value = await getSession(token);
        if (!active) return;
        // Remove bearer credential before any tile/geocoding request is rendered.
        window.history.replaceState(null, "", window.location.pathname);
        setSession(value); setLoading(false);
        if (value.coarse && !manuallyEdited.current) { setCenter(value.coarse); setZoom(value.coarse.accuracy && value.coarse.accuracy > 2000 ? 11 : 14); }
        if (!startupComplete.current) { startupComplete.current = true; start(); }
        const until = Date.now() + 20000;
        async function poll() {
          if (!active || Date.now() > until || manuallyEdited.current) return;
          try {
            const updated = await getSession();
            if (!active) return;
            setSession(updated);
            if (updated.coarse && !manuallyEdited.current && !gpsSeen.current) { setCenter(updated.coarse); setZoom(updated.coarse.accuracy && updated.coarse.accuracy > 2000 ? 11 : 14); }
            if (updated.lbsPending) timer = setTimeout(poll, 3000);
          } catch { /* GPS and manual selection remain available during LBS outage. */ }
        }
        if (value.lbsPending) timer = setTimeout(poll, 3000);
      } catch (error) {
        if (!active) return;
        setLoading(false);
        const terminal = error instanceof ApiError && [401, 410].includes(error.status);
        emit({ type: "FAIL", critical: terminal, message: terminal ? "لینک نامعتبر است یا اعتبار آن تمام شده. از اپراتور لینک تازه بخواهید یا با ۱۱۵ تماس بگیرید." : "ارتباط با مرکز برقرار نشد. دوباره تلاش کنید یا با ۱۱۵ تماس بگیرید." });
      }
    }
    void boot();
    return () => { active = false; window.removeEventListener("hashchange", openNewToken); if (timer) clearTimeout(timer); };
  }, [demo, start, networkRetry]);
  useEffect(() => {
    if (state.phase === "submitted" || state.phase === "critical") stop();
  }, [state.phase, stop]);
  useEffect(() => { if (expired) stop(); }, [expired, stop]);
  useEffect(() => {
    if (!authorized || addressMatches) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const value = await reverseGeocode(center, demo, controller.signal);
        if (controller.signal.aborted) return;
        setAddress(value); setAddressPoint(center); setAddressStatus(value ? "ready" : "missing");
      } catch {
        if (!controller.signal.aborted) { setAddress(""); setAddressPoint(center); setAddressStatus("missing"); }
      }
    }, 450);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [center, demo, authorized, addressMatches]);
  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true); setSearchMessage("");
      try {
        const places = await searchPlaces(query.trim(), demo, controller.signal);
        if (!controller.signal.aborted) { setResults(places); setSearchMessage(places.length ? "" : "نتیجه‌ای پیدا نشد. نام محله یا خیابان را امتحان کنید."); }
      } catch { if (!controller.signal.aborted) { setResults([]); setSearchMessage("جست‌وجو در دسترس نیست. نقشه را تنظیم کنید یا نشانی را بنویسید."); } }
      finally { if (!controller.signal.aborted) setSearching(false); }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, demo]);

  function beginManual() { if (busy || frozenSubmission.current) return; manuallyEdited.current = true; stop(); }
  function choose(point: Point, fromSearch = false) {
    if (busy || frozenSubmission.current || !inIran(point)) return;
    beginManual();
    if (zoom < 14 && !fromSearch) {
      setCenter(point);
      emit({ type: "FALLBACK", clearFix: true, message: "ابتدا نام شهر یا خیابان را جست‌وجو کنید و نقشه را بزرگ کنید؛ سپس درِ ورودی را انتخاب کنید." });
      return;
    }
    setCenter(point); setZoom(fromSearch ? 17 : zoom); setPatientAddress("");
    emit({ type: "MANUAL", fix: { ...point, source: "manual", accuracy: null, timestamp: Date.now() } });
  }
  function cancelLocation() {
    beginManual();
    emit({ type: "FALLBACK", message: "محل بیمار را روی نقشه انتخاب کنید و نشانی را بررسی کنید." });
    elementFocus();
  }
  function locate() {
    if (busy || frozenSubmission.current || pending) return;
    manuallyEdited.current = false; setPatientAddress(""); start();
  }
  async function submit() {
    if (sending.current || !online || expired || !state.fix || currentAddress.length < 3 || !["manual", "locked"].includes(state.phase) || !demo && !session) return;
    if (!frozenSubmission.current && !freshFix(state.fix)) { emit({ type: "FALLBACK", clearFix: true, message: "موقعیت قبلی تازه نیست. محل را روی نقشه دوباره انتخاب کنید." }); return; }
    sending.current = true; stop(); emit({ type: "SEND" });
    if (demo) {
      emit({ type: "ACK", receipt: { receiptId: "DEMO-115", acceptedAt: Date.now() } });
      sending.current = false; return;
    }
    const isRetry = !!frozenSubmission.current;
    const submission = frozenSubmission.current ?? {
      key: submissionKey(), payload: {
        location: state.fix, address: currentAddress, addressSource: patientAddress.trim() ? "patient" as const : "reverse" as const,
        details: details.trim(), verified: true as const,
        device: { userAgent: navigator.userAgent.slice(0, 512), language: navigator.language.slice(0, 40), platform: navigator.platform.slice(0, 100), viewport: `${window.innerWidth}x${window.innerHeight}` },
      },
    };
    frozenSubmission.current = submission;
    setSubmittedAttempt(true);
    try { const receipt = await sendLocation(submission.payload, submission.key, isRetry); emit({ type: "ACK", receipt }); }
    catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.code === "Location expired; select again") {
        frozenSubmission.current = null; setSubmittedAttempt(false);
        emit({ type: "FAIL", message: "موقعیت قبلی تازه نیست. محل خود را دوباره انتخاب کنید." });
        emit({ type: "FALLBACK", clearFix: true, message: "موقعیت قبلی تازه نیست. محل خود را دوباره انتخاب کنید." });
        return;
      }
      emit({ type: "FAIL", critical: error instanceof ApiError && [401, 410].includes(error.status), message: "دریافت موقعیت تأیید نشد. «ارسال دوباره» را بزنید یا با ۱۱۵ تماس بگیرید." });
    } finally { sending.current = false; }
  }
  const status = loading ? "در حال باز کردن درخواست شما…" : expired ? "اعتبار لینک تمام شده است" : labels[state.phase];
  const mapDisabled = busy || submittedAttempt;
  const contactOnly = expired || state.phase === "critical" || !online || !demo && !session && !loading;
  const canSend = online && !busy && (demo || !!session) && !!state.fix && currentAddress.length >= 3 && ["manual", "locked"].includes(state.phase);
  const pending = ["requesting", "calibrating"].includes(state.phase);

  return <div className="app-container">
    <a className="skip-link" href="#location-main">رفتن به انتخاب موقعیت</a>
    <header className="site-header"><div className="header-inner">
      <Link href="/" className="brand" aria-label="نشان، صفحه اصلی"><span className="brand-mark"><svg width="34" height="34" viewBox="0 0 40 40" aria-hidden="true"><path d="M16 3h8v10l9-5 4 7-9 5 9 5-4 7-9-5v10h-8V27l-9 5-4-7 9-5-9-5 4-7 9 5V3Z" fill="currentColor"/><path d="M20 10v19m-3-14c6-4 7 5 1 5s-6 5 2 5" fill="none" stroke="white" strokeWidth="1.6"/></svg></span><span><strong>نشان<span className="brand-divider">|</span><span className="brand-service">همراهِ امداد</span></strong><small>سامانه ارسال موقعیت به اورژانس</small></span></Link>
      <div className="header-actions"><span className="support-label">نیاز به کمک دارید؟</span><a href="tel:115" className="phone-button"><Icon name="phone" size={19} /><span>تماس با <b>۱۱۵</b></span></a></div>
    </div></header>
    <main id="location-main" className="main-content">
      <div className="context-bar"><span><Icon name="shield" size={19} />{demo ? "نسخه نمایشی — هیچ موقعیتی به اورژانس ارسال نمی‌شود" : "لینک اختصاصی شما برای ارسال موقعیت به مرکز امداد"}</span><span className="context-incident">{demo ? "درخواست نمونه" : session ? `درخواست ${session.incidentId}` : "ارتباط امن"}<span className="tiny-dot" /></span></div>
      <section className="intro"><div><div className="eyebrow"><span /> هر لحظه، مهم است</div><h1>کمک، با یک نشانی <span>نزدیک‌تر است.</span></h1><p>محل حضور بیمار را مشخص کنید تا نیروهای امداد راحت‌تر شما را پیدا کنند.</p></div><div className="intro-note"><span className="note-symbol"><Icon name="home" size={24} /></span><p><strong>کنار بیمار بمانید.</strong><span>موقعیت محل حضور بیمار را بفرستید.</span></p></div></section>
      <ol className="progress-steps" aria-label="مراحل ارسال موقعیت"><li className="complete"><span><Icon name="check" size={17} /></span>باز کردن لینک</li><li className={state.phase === "submitted" ? "complete" : "active"} aria-current={state.phase !== "submitted" ? "step" : undefined}><span>{state.phase === "submitted" ? <Icon name="check" size={17} /> : "۲"}</span>بررسی موقعیت</li><li className={state.phase === "submitted" ? "complete" : ""} aria-current={state.phase === "submitted" ? "step" : undefined}><span>{state.phase === "submitted" ? <Icon name="check" size={17} /> : "۳"}</span>ارسال به اورژانس</li></ol>
      {!online && <div className="error-banner" role="alert"><Icon name="alert" />اینترنت قطع است. موقعیت هنوز ارسال نشده؛ اتصال را بررسی کنید یا با ۱۱۵ تماس بگیرید.</div>}
      <div className="workspace">
        <section className="verification-panel" aria-label="بررسی و ارسال موقعیت">
          {state.phase === "submitted" ? <div className="success-content"><div className="success-icon"><Icon name="check" size={36} /></div><span className="eyebrow">{demo ? "پایان آزمایش" : "موقعیت دریافت شد"}</span><h2>{demo ? "مراحل را با موفقیت امتحان کردید" : "نشانی شما به مرکز رسید"}</h2><p>{demo ? "این یک نمایش است. هیچ پیام یا درخواستی به اورژانس ارسال نشده است." : "مرکز امداد موقعیت شما را دریافت کرد. کنار بیمار بمانید و تلفن خود را در دسترس نگه دارید."}</p><div className="receipt"><Icon name="shield" /><span>{demo ? "تأیید نمونه" : "شماره تأیید دریافت"}<b dir="ltr">{state.receipt?.receiptId}</b></span></div><a className="primary-button" href="tel:115"><Icon name="phone" />تماس با ۱۱۵</a>{demo && <button className="text-button full-width" onClick={() => window.location.reload()}>شروع دوباره نمایش</button>}</div> : <>
            <div className="panel-heading"><span className="panel-icon"><Icon name="pin" size={25} /></span><div><h2>اینجا هستید؟</h2><p>نشانی و نقطه روی نقشه را بررسی کنید.</p></div></div>
            <div className={`location-status ${state.phase === "locked" ? "good" : pending || loading ? "pending" : ""}`} role="status" aria-live="polite"><span className={pending || loading ? "spinner" : "status-dot"}>{state.phase === "locked" && <Icon name="check" size={13} />}</span><span>{status}</span></div>
            <div className="address-preview"><span className="field-eyebrow">{demo ? "نشانی نمونه روی نقشه" : "نشانی محل انتخاب‌شده"}</span><h3>{addressStatus === "loading" || !addressMatches ? "در حال پیدا کردن نشانی…" : address || "نشانی را در کادر زیر بنویسید"}</h3><p><Icon name="pin" size={15} />{state.phase === "locked" ? "نشانی را با محل حضور بیمار تطبیق دهید." : "نشانگر را روی درِ ورودی یا محل حضور بیمار بگذارید."}</p></div>
            {state.problem && <p className="inline-error" role="alert">{state.problem}</p>}
            {expired && <p className="inline-error" role="alert">لینک منقضی شده است. از اپراتور لینک تازه بخواهید یا با ۱۱۵ تماس بگیرید.</p>}
            {!session && !demo && !loading && state.phase !== "critical" && <button className="secondary-button" onClick={() => { setLoading(true); setNetworkRetry(v => v + 1); }}>تلاش دوباره برای اتصال</button>}
            <button className="gps-button" onClick={locate} disabled={mapDisabled || pending}><Icon name="locate" size={23} /><span>{pending ? "در حال پیدا کردن موقعیت…" : "موقعیت من را پیدا کن"}</span>{!pending && <Icon name="arrow" size={19} />}</button>
            {pending && <button className="secondary-button cancel-location" onClick={cancelLocation} disabled={mapDisabled}>توقف جست‌وجو و انتخاب روی نقشه</button>}
            <div className="or-divider"><span />یا خودتان محل را انتخاب کنید<span /></div>
            <button className="manual-button" disabled={mapDisabled} onClick={() => { choose(center); elementFocus(); }}><Icon name="pin" size={20} />این نقطه، محل حضور بیمار است<Icon name="check" size={18} /></button>
            <button className="details-toggle" onClick={() => setDetailsOpen(v => !v)} aria-expanded={detailsOpen} disabled={mapDisabled}><span><Icon name="plus" size={18} />نشانی و راهنمای رسیدن <small>{addressStatus === "missing" ? "ضروری" : "اختیاری"}</small></span><Icon name="chevron" size={18} className={detailsOpen ? "rotated" : ""} /></button>
            {(detailsOpen || addressStatus === "missing") && <div className="details-fields"><label htmlFor="patient-address">نشانی دقیق محل بیمار</label><input id="patient-address" value={patientAddress} maxLength={500} onChange={e => setPatientAddress(e.target.value)} disabled={mapDisabled} placeholder="شهر، خیابان، کوچه، پلاک" /><label htmlFor="arrival-details">راهنمای رسیدن به بیمار</label><textarea id="arrival-details" value={details} maxLength={500} onChange={e => setDetails(e.target.value)} disabled={mapDisabled} placeholder="مثلاً درِ آبی، پلاک ۱۲، طبقه همکف" rows={2} /></div>}
            <div className="send-area"><p>با تأیید، این محل را برای مرکز امداد می‌فرستید.</p>{contactOnly ? <a className="primary-button" href="tel:115"><Icon name="phone" size={23} />تماس با اورژانس ۱۱۵<Icon name="arrow" size={22} /></a> : <button className="primary-button" disabled={!canSend} onClick={() => void submit()}>{state.phase === "submitting" ? <span className="spinner" /> : <Icon name="check" size={23} />}<span>{state.phase === "submitting" ? "در حال ارسال…" : submittedAttempt ? "ارسال دوباره موقعیت" : "تأیید و ارسال موقعیت"}</span><Icon name="arrow" size={22} /></button>}<span className="secure-caption"><Icon name="lock" size={14} />{contactOnly ? "موقعیت هنوز از این صفحه ارسال نشده است" : demo ? "ارسال آزمایشی؛ بدون تماس با مرکز" : "ارسال فقط برای همین درخواست امداد"}</span></div>
          </>}
        </section>
        <section className="map-panel" aria-label="انتخاب محل بیمار روی نقشه"><div className="map-panel-heading"><div><h2>محل بیمار روی نقشه</h2><span>{demo ? "نقشه نمونه تهران · می‌توانید جابه‌جا کنید" : located ? "نقطه مشخص‌شده را با محل خود تطبیق دهید" : session?.coarse ? "محدوده تقریبی؛ لطفاً محل دقیق را انتخاب کنید" : "نام شهر یا خیابان خود را جست‌وجو کنید"}</span></div><span className="map-live"><span />{online ? "نقشه خیابان‌ها" : "بدون اتصال"}</span></div>
          <div className="map-search"><Icon name="search" size={21} /><label className="sr-only" htmlFor="landmark-search">جست‌وجوی شهر، خیابان یا مکان نزدیک</label><input id="landmark-search" disabled={mapDisabled} value={query} onChange={e => { setQuery(e.target.value); setResults([]); setSearchMessage(""); setSearching(false); }} placeholder="نام خیابان، بیمارستان یا یک مکان نزدیک…" autoComplete="off" maxLength={100} />{query && <button aria-label="پاک کردن جست‌وجو" disabled={mapDisabled} onClick={() => { setQuery(""); setResults([]); setSearchMessage(""); setSearching(false); }}><Icon name="close" size={20} /></button>}</div>
          {(results.length > 0 || searching || searchMessage) && <div className="search-results" role="region" aria-label="نتایج جست‌وجو"><p role="status">{searching ? "در حال جست‌وجو…" : searchMessage}</p>{results.map(place => <button key={place.id} disabled={mapDisabled} onClick={() => { choose(place, true); setZoom(17); setQuery(""); setResults([]); setSearchMessage(""); setSearching(false); }}><Icon name="pin" /><span><strong>{place.title}</strong><small>{place.address}</small></span><Icon name="arrow" size={18} /></button>)}</div>}
          <LocationMap center={center} zoom={zoom} onZoom={setZoom} onChange={choose} onInteract={beginManual} onLocate={locate} disabled={mapDisabled} radius={state.fix ? state.fix.accuracy : session?.coarse?.accuracy ?? null} demo={demo} />
          <div className="map-footer"><span><Icon name="help" size={18} />محل درست نیست؟ نقشه را جابه‌جا کنید.</span><button onClick={() => setHelp(true)}>راهنمای پیدا کردن محل<Icon name="arrow" size={16} /></button></div>
        </section>
      </div>
      <section className="reassurance"><div><span className="reassurance-icon"><Icon name="shield" size={25} /></span><p><strong>فقط برای پیدا کردن شما</strong><span>موقعیت شما به همین درخواست امداد متصل می‌شود.</span></p></div><div><span className="reassurance-icon"><Icon name="phone" size={24} /></span><p><strong>به کمک نیاز دارید؟</strong><span>اگر ارسال ممکن نیست، با <a href="tel:115">اورژانس ۱۱۵</a> تماس بگیرید.</span></p></div><div><span className="reassurance-icon"><Icon name="pin" size={25} /></span><p><strong>نشانی شما مهم است</strong><span>کوچه، پلاک و ورودی را برای رسیدن آسان‌تر مشخص کنید.</span></p></div></section>
      <footer className="site-footer"><span>نشان<span className="footer-dot">·</span>همراه شما در لحظه‌های مهم</span><button onClick={() => setHelp(true)}><Icon name="help" size={17} />راهنمای دسترسی به موقعیت</button></footer>
    </main>
    {help && <PermissionHelp onClose={() => setHelp(false)} onRetry={locate} />}
  </div>;
}
function elementFocus() { document.querySelector<HTMLElement>(".map-canvas")?.focus({ preventScroll: true }); }
