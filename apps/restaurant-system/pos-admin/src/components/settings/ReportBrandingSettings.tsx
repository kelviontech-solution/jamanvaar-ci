import React, { useState } from 'react';
import { db } from '@jamanvaar/database';
import { isValidGstinFormat, isValidFssaiFormat, isValidIndianPincode, isValidIndianPhone } from '@jamanvaar/utils';
import { saveRestaurantIdentity } from '../../cloud/cloudClient';
import {
  Building,
  FileText,
  ShieldCheck,
  Phone,
  Mail,
  Globe,
  Palette,
  User,
  CheckCircle2,
  Image,
  Upload,
  RotateCcw
} from 'lucide-react';

interface ReportBrandingSettingsProps {
  showToast: (msg: string) => void;
  onUpdated: () => void;
}

export const ReportBrandingSettings: React.FC<ReportBrandingSettingsProps> = ({
  showToast,
  onUpdated
}) => {
  const [name, setName] = useState(db.restaurant.name || '');
  const [legalName, setLegalName] = useState(
    db.restaurant.legalName || ''
  );
  const [tagline, setTagline] = useState(
    db.restaurant.tagline || ''
  );
  const [logoUrl, setLogoUrl] = useState(db.restaurant.logoUrl || '/jamanvaar.png.png');
  const [address, setAddress] = useState(db.outlet.address || db.restaurant.address || '');
  const [city, setCity] = useState(db.outlet.city || db.restaurant.city || '');
  const [state, setState] = useState(db.outlet.state || db.restaurant.state || '');
  const [pincode, setPincode] = useState(db.restaurant.pincode || '');
  const [phone, setPhone] = useState(db.restaurant.phone || '');
  const [email, setEmail] = useState(db.restaurant.email || '');
  const [gstin, setGstin] = useState(db.restaurant.gstin || '');
  const [fssaiNumber, setFssaiNumber] = useState(db.restaurant.fssaiNumber || '');
  const [msmeNumber, setMsmeNumber] = useState(db.restaurant.msmeNumber || '');
  const [website, setWebsite] = useState(db.restaurant.website || '');
  const [footerText, setFooterText] = useState(
    db.restaurant.footerText || ''
  );
  const [primaryColor, setPrimaryColor] = useState(db.restaurant.primaryColor || '#0B253A');
  const [secondaryColor, setSecondaryColor] = useState(db.restaurant.secondaryColor || '#E66817');
  const [ownerName, setOwnerName] = useState(db.restaurant.ownerName || 'Ramesh Patel');
  const [managerName, setManagerName] = useState(db.restaurant.managerName || 'Pooja Shah');
  const [showJamanAI, setShowJamanAI] = useState(db.restaurant.showJamanAI !== false);
  // B2-040: GSTIN/FSSAI/pincode/phone were accepted as any string with no format check at all —
  // "GSTIN: abc" reached real customer tax invoices via db.receiptConfig below. All four stay
  // optional (a small/unregistered restaurant may genuinely have none), but a value that IS
  // given must be well-formed, same rule Super Admin's own create/update-restaurant API already
  // enforces server-side (BUG-054) — this screen never went through that API at all.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    const errors: Record<string, string> = {};
    if (gstin.trim() && !isValidGstinFormat(gstin)) {
      errors.gstin = 'GSTIN must be 15 characters in the standard format (e.g. 24AAACR5055K1Z1).';
    }
    if (fssaiNumber.trim() && !isValidFssaiFormat(fssaiNumber)) {
      errors.fssaiNumber = 'FSSAI licence number must be exactly 14 digits.';
    }
    if (pincode.trim() && !isValidIndianPincode(pincode)) {
      errors.pincode = 'Enter a valid 6-digit PIN code.';
    }
    if (phone.trim() && !isValidIndianPhone(phone)) {
      errors.phone = 'Enter a valid 10-digit Indian phone number.';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    // Update restaurant
    db.restaurant.name = name;
    db.restaurant.legalName = legalName;
    db.restaurant.tagline = tagline;
    db.restaurant.logoUrl = logoUrl;
    db.restaurant.address = address;
    db.restaurant.city = city;
    db.restaurant.state = state;
    db.restaurant.pincode = pincode;
    db.restaurant.phone = phone;
    db.restaurant.email = email;
    db.restaurant.gstin = gstin;
    db.restaurant.fssaiNumber = fssaiNumber;
    db.restaurant.msmeNumber = msmeNumber;
    db.restaurant.website = website;
    db.restaurant.footerText = footerText;
    db.restaurant.primaryColor = primaryColor;
    db.restaurant.secondaryColor = secondaryColor;
    db.restaurant.ownerName = ownerName;
    db.restaurant.managerName = managerName;

    // Update outlet address
    db.outlet.address = address;
    db.outlet.city = city;
    db.outlet.state = state;
    db.outlet.phone = phone;

    // This panel's own label claims it governs "GST tax invoices, and
    // thermal bills" — but db.receiptConfig (what Kiosk/POS actually print
    // on a customer receipt) is a separate record nothing here ever touched,
    // so a real GSTIN entered here never reached a real customer invoice.
    // Kiosk Admin's own Receipt Settings tab can still override these
    // afterward for a legitimate per-outlet GSTIN if one is ever needed.
    db.receiptConfig.restaurantName = name;
    db.receiptConfig.address = address;
    db.receiptConfig.phone = phone;
    db.receiptConfig.gstin = gstin;
    db.receiptConfig.fssaiNumber = fssaiNumber;

    db.restaurant.showJamanAI = showJamanAI;

    db.notify();
    // B2-054: the legal/registration details (name, GSTIN, FSSAI, address, city, state) used to
    // stay on this one device forever — POS, Captain, KDS and both kiosk apps never learned of an
    // edit made here, and it was lost entirely on a fresh device or a reinstall. Best-effort: a
    // failed push is simply retried by every terminal's own periodic pull once this one succeeds.
    void saveRestaurantIdentity({ name, legalName, gstin, fssaiNumber, address, city, state, showJamanAI });
    onUpdated();
    showToast('Restaurant Branding & Accounting Profile Saved!');
  };

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-5xl mx-auto">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-jaman-navy">
            Report Branding & Legal Profile
          </h1>
          <p className="text-xs text-[#4A5568] mt-0.5">
            Configure restaurant identity used on End of Day (EOD) Z-Reports, GST tax invoices, and thermal bills.
          </p>
        </div>

        <button
          type="submit"
          className="px-6 py-2.5 bg-jaman-saffron hover:bg-[#EA580C] text-white font-black text-xs rounded-xl shadow-xs flex items-center gap-2 min-h-[44px]"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Save Changes</span>
        </button>
      </div>

      {/* App Preferences — layered on top of the platform-wide JAMAN AI
          entitlement toggle in Super Admin, which only controls whether the
          feature exists at all; this is the per-restaurant opt-out. */}
      <div className="bg-white p-5 rounded-3xl border border-jaman-border shadow-2xs flex items-center justify-between gap-4">
        <div>
          <span className="text-sm font-black text-jaman-navy block">Show JAMAN AI Assistant</span>
          <span className="text-xs text-slate-500">
            Displays the floating JAMAN AI button on POS, Captain and this Admin console. Turning this off hides it for every staff member at this restaurant.
          </span>
        </div>
        <label className="relative inline-flex items-center cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={showJamanAI}
            onChange={(e) => {
              // Takes effect at once (no Save needed) and is sent to the cloud so POS and Captain follow it too.
              const on = e.target.checked;
              setShowJamanAI(on);
              db.restaurant.showJamanAI = on;
              db.notify();
              void saveRestaurantIdentity({ showJamanAI: on });
            }}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-slate-200 peer-checked:bg-jaman-saffron rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5" />
        </label>
      </div>

      {/* Live Preview Card */}
      <div className="bg-jaman-cream p-5 rounded-3xl border border-slate-300 shadow-2xs space-y-3">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
          LIVE DOCUMENT HEADER PREVIEW:
        </span>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-left">
            {logoUrl && (
              <img
                src={logoUrl}
                alt="Logo"
                className="w-12 h-12 object-contain rounded-lg border border-slate-100 p-0.5"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            )}
            <div>
              <h3 className="font-black text-sm text-jaman-navy uppercase">{name}</h3>
              <span className="text-[10px] text-slate-500 font-bold block">{legalName}</span>
              <span className="text-[10px] text-slate-400 italic block">{tagline}</span>
            </div>
          </div>

          <div className="text-right text-[10px] font-mono text-slate-600 space-y-0.5">
            <div>{address}, {city}, {state} {pincode}</div>
            <div>GSTIN: <strong>{gstin}</strong> • FSSAI: <strong>{fssaiNumber}</strong></div>
            <div>Phone: {phone} • Email: {email}</div>
          </div>
        </div>
      </div>

      {/* Main Settings Grid */}
      <div className="bg-white p-6 rounded-3xl border border-jaman-border shadow-xs space-y-6 text-xs">
        
        {/* 1. Identity & Trade Names */}
        <div className="space-y-3">
          <h3 className="font-black text-sm text-jaman-navy flex items-center gap-2 border-b border-slate-100 pb-2">
            <Building className="w-4 h-4 text-jaman-saffron" />
            <span>1. Restaurant Identity & Trade Names</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Restaurant Trade / Brand Name:
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. JAMANVAAR RESTAURANT"
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2.5 font-bold text-jaman-navy focus:outline-none focus:border-jaman-saffron"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">Used in customer apps, bills & headings</span>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Legal Registered Entity Name:
              </label>
              <input
                type="text"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="e.g. JAMANVAAR FOODS & HOSPITALITY PRIVATE LIMITED"
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2.5 font-bold text-jaman-navy focus:outline-none focus:border-jaman-saffron"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">Used on GST Invoices & official EOD Reports</span>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Brand Tagline / Slogan:
              </label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="e.g. Authentic Indian Cuisine & Seamless Dining by KELVIONTECH"
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2.5 font-semibold text-jaman-navy focus:outline-none focus:border-jaman-saffron"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Restaurant Logo Asset Path / URL:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="/jamanvaar.png.png"
                  className="flex-1 bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2.5 font-mono text-xs font-semibold focus:outline-none focus:border-jaman-saffron"
                />
                <button
                  type="button"
                  onClick={() => setLogoUrl('/jamanvaar.png.png')}
                  className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-[11px]"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Tax & Legal Regulatory Numbers */}
        <div className="space-y-3">
          <h3 className="font-black text-sm text-jaman-navy flex items-center gap-2 border-b border-slate-100 pb-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>2. Statutory Tax & Regulatory Credentials</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                GSTIN Number (15 Digits):
              </label>
              <input
                type="text"
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                placeholder="24ABCDE1234F1Z5"
                className={`w-full bg-jaman-ivory border rounded-xl px-3.5 py-2.5 font-mono font-bold text-jaman-navy focus:outline-none focus:border-jaman-saffron ${fieldErrors.gstin ? 'border-rose-400' : 'border-jaman-border'}`}
              />
              {fieldErrors.gstin && <span className="text-[10px] text-rose-600 font-bold mt-0.5 block">{fieldErrors.gstin}</span>}
              <span className="text-[10px] text-slate-400 mt-0.5 block">Optional — leave blank if not GST-registered</span>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                FSSAI License Number (14 Digits):
              </label>
              <input
                type="text"
                value={fssaiNumber}
                onChange={(e) => setFssaiNumber(e.target.value)}
                placeholder="10722001000452"
                className={`w-full bg-jaman-ivory border rounded-xl px-3.5 py-2.5 font-mono font-bold text-jaman-navy focus:outline-none focus:border-jaman-saffron ${fieldErrors.fssaiNumber ? 'border-rose-400' : 'border-jaman-border'}`}
              />
              {fieldErrors.fssaiNumber && <span className="text-[10px] text-rose-600 font-bold mt-0.5 block">{fieldErrors.fssaiNumber}</span>}
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                MSME / Udyam Number (Optional):
              </label>
              <input
                type="text"
                value={msmeNumber}
                onChange={(e) => setMsmeNumber(e.target.value)}
                placeholder="UDYAM-GJ-01-0012345"
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2.5 font-mono font-bold text-jaman-navy focus:outline-none focus:border-jaman-saffron"
              />
            </div>
          </div>
        </div>

        {/* 3. Address & Physical Location */}
        <div className="space-y-3">
          <h3 className="font-black text-sm text-jaman-navy flex items-center gap-2 border-b border-slate-100 pb-2">
            <Building className="w-4 h-4 text-blue-600" />
            <span>3. Address & Geographical Location</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <label className="block font-bold text-slate-700 mb-1">Street Address:</label>
              <input
                type="text"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Sindhu Bhavan Road, Bodakdev"
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2.5 font-bold text-jaman-navy focus:outline-none focus:border-jaman-saffron"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">City:</label>
              <input
                type="text"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Ahmedabad"
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2.5 font-bold text-jaman-navy focus:outline-none focus:border-jaman-saffron"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">State & Pincode:</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="Gujarat"
                  className="w-2/3 bg-jaman-ivory border border-jaman-border rounded-xl px-3 py-2.5 font-bold text-jaman-navy focus:outline-none focus:border-jaman-saffron"
                />
                <input
                  type="text"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  placeholder="380054"
                  className={`w-1/3 bg-jaman-ivory border rounded-xl px-2 py-2.5 font-mono font-bold text-jaman-navy focus:outline-none focus:border-jaman-saffron ${fieldErrors.pincode ? 'border-rose-400' : 'border-jaman-border'}`}
                />
              </div>
              {fieldErrors.pincode && <span className="text-[10px] text-rose-600 font-bold mt-0.5 block">{fieldErrors.pincode}</span>}
            </div>
          </div>
        </div>

        {/* 4. Contact & Online Details */}
        <div className="space-y-3">
          <h3 className="font-black text-sm text-jaman-navy flex items-center gap-2 border-b border-slate-100 pb-2">
            <Phone className="w-4 h-4 text-purple-600" />
            <span>4. Contact Channels & Website</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Contact Phone:</label>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 79 4890 1234"
                className={`w-full bg-jaman-ivory border rounded-xl px-3.5 py-2.5 font-mono font-bold text-jaman-navy focus:outline-none focus:border-jaman-saffron ${fieldErrors.phone ? 'border-rose-400' : 'border-jaman-border'}`}
              />
              {fieldErrors.phone && <span className="text-[10px] text-rose-600 font-bold mt-0.5 block">{fieldErrors.phone}</span>}
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Contact Email:</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="hello@jamanvaar.com"
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2.5 font-bold text-jaman-navy focus:outline-none focus:border-jaman-saffron"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Official Website URL:</label>
              <input
                type="text"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://jamanvaar.com"
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2.5 font-semibold text-jaman-navy focus:outline-none focus:border-jaman-saffron"
              />
            </div>
          </div>
        </div>

        {/* 5. Authorizing Officials & Footer Message */}
        <div className="space-y-3">
          <h3 className="font-black text-sm text-jaman-navy flex items-center gap-2 border-b border-slate-100 pb-2">
            <User className="w-4 h-4 text-amber-600" />
            <span>5. Signatories & Printed Statement Footer</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Restaurant Owner Name:</label>
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Ramesh Patel"
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2.5 font-bold text-jaman-navy focus:outline-none focus:border-jaman-saffron"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Floor Manager Name:</label>
              <input
                type="text"
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
                placeholder="Pooja Shah"
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2.5 font-bold text-jaman-navy focus:outline-none focus:border-jaman-saffron"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Report Footer Closing Remark:</label>
              <input
                type="text"
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
                placeholder="Official Daily Closing Statement • Powered by JAMANVAAR by KELVIONTECH"
                className="w-full bg-jaman-ivory border border-jaman-border rounded-xl px-3.5 py-2.5 font-semibold text-jaman-navy focus:outline-none focus:border-jaman-saffron"
              />
            </div>
          </div>
        </div>

        {/* Submit Action */}
        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <button
            type="submit"
            className="px-8 py-3 bg-jaman-saffron hover:bg-[#EA580C] text-white font-black text-xs rounded-2xl shadow-xs transition-all flex items-center gap-2 min-h-[44px]"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Save & Apply Across All Reports</span>
          </button>
        </div>

      </div>

    </form>
  );
};
