"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
export function PermissionHelp({ onClose, onRetry }: { onClose: () => void; onRetry: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [platform, setPlatform] = useState<"ios" | "android">(() => typeof navigator !== "undefined" && (/iPhone|iPad|iPod/.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? "ios" : "android");
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  const ios = platform === "ios";
  return <dialog className="help-dialog" ref={dialog} onCancel={onClose} aria-labelledby="permission-title">
    <button className="dialog-close icon-button" onClick={onClose} aria-label="بستن راهنما"><Icon name="close" /></button>
    <div className="dialog-icon"><Icon name="locate" size={32} /></div>
    <h2 id="permission-title">اجازه دهید محل شما پیدا شود</h2>
    <p>اگر دسترسی بسته است، این مراحل را انجام دهید. همیشه می‌توانید محل را روی نقشه انتخاب کنید.</p>
    <div className="platform-tabs"><button aria-pressed={ios} onClick={() => setPlatform("ios")}>آیفون · Safari</button><button aria-pressed={!ios} onClick={() => setPlatform("android")}>اندروید · Chrome</button></div>
    <ol className="permission-steps">
      <li><span className="step-number">۱</span><div><strong>{ios ? "منوی صفحه را باز کنید" : "کنار نشانی سایت بزنید"}</strong><div className="browser-drawing" dir="ltr"><span className="highlight-tap">{ios ? "aA / ▤" : "☷"}</span><span> emergency.example</span><Icon name="lock" size={16} /></div><small>{ios ? "نماد منو کنار نوار نشانی؛ جای آن با نسخه Safari فرق دارد." : "نماد تنظیمات در سمت چپ نشانی سایت."}</small></div></li>
      <li><span className="step-number">۲</span><div><strong>{ios ? "تنظیمات وب‌سایت را انتخاب کنید" : "مجوزها را انتخاب کنید"}</strong><div className="setting-drawing" dir="ltr"><span>{ios ? "Website Settings" : "Permissions"}</span><Icon name="chevron" size={18} /></div></div></li>
      <li><span className="step-number">۳</span><div><strong>دسترسی به موقعیت را فعال کنید</strong><div className="setting-drawing" dir="ltr"><span>Location</span><span className="allow-pill">Allow <Icon name="check" size={14} /></span></div><small>موقعیت دقیق را هم در تنظیمات گوشی روشن کنید.</small></div></li>
    </ol>
    <p className="help-note">اگر لینک داخل پیام‌رسان باز شده، از منوی آن «باز کردن در مرورگر» را انتخاب کنید. در آیفون، تنظیمات گوشی، حریم خصوصی، خدمات موقعیت مکانی را هم بررسی کنید.</p>
    <button className="primary-button" onClick={() => { onClose(); onRetry(); }}><Icon name="locate" />دوباره موقعیت را پیدا کن</button>
    <button className="text-button full-width" onClick={onClose}>خودم روی نقشه انتخاب می‌کنم</button>
  </dialog>;
}
