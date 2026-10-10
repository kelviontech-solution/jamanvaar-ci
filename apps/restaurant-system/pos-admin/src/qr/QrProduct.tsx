import { lazy, Suspense, useEffect, useState } from "react";
const QrWorkspace = lazy(() => import("./QrWorkspace"));
export { safeQrDestination } from "./qrRoutes";
const logo = "/qr/assets/branding/jamanvaar-logo.png";
const pages = [
  "/qr/",
  "/qr/login/",
  "/qr/activate/",
  "/qr/recover/",
  "/qr/admin/",
];
export function QrProduct() {
  const path = location.pathname.endsWith("/")
    ? location.pathname
    : location.pathname + "/";
  const [toast, setToast] = useState("");
  useEffect(() => {
    const robots =
      document.querySelector("meta[name=robots]") ??
      document.head.appendChild(document.createElement("meta"));
    robots.setAttribute("name", "robots");
    robots.setAttribute(
      "content",
      path === "/qr/" ? "index,follow" : "noindex,nofollow",
    );
    document.title =
      path === "/qr/"
        ? "Jamanvaar QR Ordering — Scan. Choose. Enjoy."
        : "Jamanvaar QR Admin";
  }, [path]);
  if (!pages.includes(path))
    return (
      <div className="qr-product">
        <Header />
        <main className="qr-section">
          <h1>Page not found</h1>
          <a href="/qr/">Return to QR Ordering</a>
        </main>
      </div>
    );
  return (
    <div className="qr-product">
      {path === "/qr/" ? (
        <Landing />
      ) : path === "/qr/admin/" ? (
        <Suspense
          fallback={<main className="qr-section">Opening QR Admin...</main>}
        >
          <QrWorkspace page="ADMIN" toast={setToast} />
        </Suspense>
      ) : (
        <>
          <Header />
          <Suspense
            fallback={
              <main className="qr-section">Opening secure sign in...</main>
            }
          >
            <QrWorkspace
              page={
                path === "/qr/activate/"
                  ? "ACTIVATE"
                  : path === "/qr/recover/"
                    ? "RECOVER"
                    : "LOGIN"
              }
              toast={setToast}
            />
          </Suspense>
        </>
      )}
      {toast && (
        <div role="status" className="qr-toast">
          <span>{toast}</span>
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="qr-site-header">
      <a className="qr-identity" href="/qr/">
        <img src={logo} alt="Jamanvaar by Kelviontech" />
        <span>
          QR ORDERING<small>A little scan. A better meal.</small>
        </span>
      </a>
      <button
        className="qr-menu-toggle"
        aria-expanded={open}
        aria-controls="qr-site-nav"
        onClick={() => setOpen(!open)}
      >
        Menu
      </button>
      <nav id="qr-site-nav" className={open ? "open" : ""}>
        {[
          "Features",
          "How it works",
          "Benefits",
          "Payments",
          "Integrations",
          "FAQ",
        ].map((s) => (
          <a key={s} href={"/qr/#" + s.toLowerCase().replaceAll(" ", "-")}>
            {s}
          </a>
        ))}
      </nav>
      <a className="qr-login" href="/qr/login/">
        Login
      </a>
      <a className="qr-btn" href="/qr/activate/">
        Get started
      </a>
    </header>
  );
}
function Landing() {
  return (
    <>
      <Header />
      <main>
        <section className="qr-hero">
          <div>
            <span className="qr-eyebrow">FROM YOUR TABLE TO THEIR PHONE</span>
            <h1>
              Every table.
              <br />A delicious
              <br />
              <em>new experience.</em>
            </h1>
            <p>
              Guests scan, explore your menu, make it their own and order from
              their phones. You manage the menu, payments and kitchen handoff in
              one clear workspace.
            </p>
            <div className="qr-actions">
              <a className="qr-btn" href="#demo">
                Explore QR Ordering →
              </a>
              <a className="qr-btn secondary" href="/qr/login/">
                Login to QR Admin
              </a>
            </div>
            <p className="qr-fine">
              Works as a standalone product. Connect POS, KDS and Captain when
              licensed.
            </p>
          </div>
          <div className="qr-hero-scene">
            <div className="qr-table-card">
              <img src={logo} alt="" />
              <b>Good food begins here.</b>
              <div className="qr-sample-code" aria-hidden="true">
                ▦
              </div>
              <span>Illustrative table card · not a live QR</span>
            </div>
            <div className="qr-phone">
              <div className="qr-phone-bar">JAMANVAAR · DEMO TABLE</div>
              <img
                src="/qr/assets/menu/thali/gujarati-thali.jpg"
                alt="Gujarati meal"
                onError={(e) => {
                  e.currentTarget.src = "/qr/assets/menu/placeholder-dish.svg";
                }}
              />
              <h2>A taste of home.</h2>
              <p>Fresh flavours. Your favourites.</p>
              <div className="qr-sample-line">
                <span>Gujarati Thali</span>
                <b>₹299</b>
              </div>
              <a className="qr-btn" href="#demo">
                Try the sample menu
              </a>
            </div>
            <div className="qr-scene-note">
              ✓ Clear totals
              <br />
              <small>Secure online checkout or pay at counter</small>
            </div>
          </div>
        </section>
        <section id="benefits" className="qr-section qr-benefits">
          <span className="qr-eyebrow">MORE TIME FOR HOSPITALITY</span>
          <h2>
            Simple for your guests.
            <br />
            Useful for your team.
          </h2>
          <div className="qr-columns">
            {[
              [
                "01",
                "A menu in every hand",
                "Guests browse food images, customise dishes and check their cart before ordering.",
              ],
              [
                "02",
                "Your menu stays yours",
                "Publish prices deliberately and keep availability current across your branch.",
              ],
              [
                "03",
                "A connected service",
                "See QR orders in QR Admin and route them into licensed counter and kitchen workflows.",
              ],
            ].map(([n, t, d]) => (
              <article key={n}>
                <span className="qr-number">{n}</span>
                <h3>{t}</h3>
                <p>{d}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="demo" className="qr-section qr-demo-section">
          <div>
            <span className="qr-eyebrow">TRY IT WITHOUT SIGNING IN</span>
            <h2>
              Meet your next
              <br />
              digital menu.
            </h2>
            <p>
              A sample guest experience. Explore a dish, choose extras and
              preview checkout. This demo cannot submit an order or collect
              money.
            </p>
          </div>
          <Demo />
        </section>
        <section id="features" className="qr-section">
          <span className="qr-eyebrow">A COMPLETE ORDERING WORKSPACE</span>
          <h2>
            From the first scan
            <br />
            to the last plate.
          </h2>
          <div className="qr-feature-grid">
            {[
              [
                "Smart digital menu",
                "Categories, search, variants, add-ons and published menu images.",
              ],
              [
                "Tables & QR",
                "Map codes to tables and download print-ready designs.",
              ],
              [
                "Orders & payments",
                "Payment status stays separate from preparation and completion.",
              ],
              [
                "Insights that matter",
                "Understand accepted orders, confirmed collections and outstanding cash.",
              ],
              [
                "Your restaurant, your page",
                "Review branding and the customer page before saving changes.",
              ],
              [
                "Optional advanced tools",
                "Languages, loyalty, group ordering, feedback and promotions are available when licensed and enabled.",
              ],
            ].map(([t, d]) => (
              <article key={t}>
                <h3>{t}</h3>
                <p>{d}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="how-it-works" className="qr-section qr-how">
          <span className="qr-eyebrow">YOUR FIRST TABLE, STEP BY STEP</span>
          <h2>Set up once. Serve every day.</h2>
          <ol>
            {[
              "Sign in and activate your licensed QR Admin access.",
              "Confirm your restaurant and branch.",
              "Review and publish the menu you already manage.",
              "Choose payment methods and ordering hours.",
              "Map, design and print your table QR codes.",
              "Check your setup, then manage orders as guests arrive.",
            ].map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <a className="qr-btn" href="/qr/activate/">
            Activate QR Ordering →
          </a>
        </section>
        <section id="payments" className="qr-section qr-columns">
          <div>
            <span className="qr-eyebrow">PAYMENTS WITH CLARITY</span>
            <h2>
              The choice is yours.
              <br />
              The totals are clear.
            </h2>
          </div>
          <div>
            <h3>Online, when configured</h3>
            <p>
              Secure Razorpay checkout appears when your merchant integration is
              ready. A payment is confirmed after backend verification.
            </p>
            <h3>Cash at counter</h3>
            <p>
              Enable counter collection independently. Staff record money
              received, while guests see the balance due.
            </p>
          </div>
        </section>
        <section id="integrations" className="qr-section">
          <span className="qr-eyebrow">ONE RESTAURANT PLATFORM</span>
          <h2>
            QR on its own.
            <br />
            More connected together.
          </h2>
          <div className="qr-integrations">
            {[
              "Restaurant Admin",
              "POS",
              "Kitchen / KDS",
              "Captain",
              "Verified payment gateway",
            ].map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>
          <p>
            QR Ordering can operate through its own admin workspace. Additional
            applications follow your subscription and branch configuration.
          </p>
        </section>
        <section id="faq" className="qr-section qr-faq">
          <h2>A few things you might ask.</h2>
          {[
            [
              "Do my guests need an app?",
              "No. Your table code opens the customer menu in their browser.",
            ],
            [
              "Do I need a POS subscription?",
              "QR Admin can manage QR orders independently. POS and other integrations are optional licensed applications.",
            ],
            [
              "Where do I get an activation key?",
              "Your platform administrator issues a management key for your licensed restaurant. Sign in with your existing owner or manager account before connecting a new console.",
            ],
            [
              "Can I recover my account?",
              "Use password recovery with your registered Restaurant ID. Device reassignment and new keys are handled by your platform administrator.",
            ],
            [
              "Does the demo place real orders?",
              "No. It is an isolated sample preview, with no order or payment API calls.",
            ],
          ].map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </section>
        <section className="qr-final">
          <h2>
            A warm welcome.
            <br />A simpler way to order.
          </h2>
          <a className="qr-btn" href="/qr/activate/">
            Get started
          </a>
        </section>
      </main>
      <footer className="qr-footer">
        <img src={logo} alt="Jamanvaar by Kelviontech" />
        <p>QR Ordering · Built by Kelviontech</p>
        <a href="/qr/login/">QR Admin login</a>
        <a href="/qr/recover/">Account recovery</a>
        <a href="/restaurant-admin/">Restaurant Admin</a>
      </footer>
    </>
  );
}
function Demo() {
  const [custom, setCustom] = useState(false),
    [extra, setExtra] = useState(false),
    [qty, setQty] = useState(0),
    [checkout, setCheckout] = useState(false),
    [total, setTotal] = useState(0);
  return (
    <div className="qr-demo" aria-label="Interactive sample menu">
      <span className="qr-demo-label">DEMO · NO REAL ORDERS OR PAYMENTS</span>
      <h3>Gujarati Thali</h3>
      <p>Shaak, dal, rice, rotli and a sweet finish.</p>
      <div className="qr-sample-line">
        <b>₹299</b>
        <button className="qr-btn" onClick={() => setCustom(true)}>
          Customise dish
        </button>
      </div>
      {custom && (
        <fieldset>
          <legend>Make it yours</legend>
          <label>
            <input
              type="checkbox"
              checked={extra}
              onChange={(e) => setExtra(e.target.checked)}
            />
            Extra rotli · ₹20
          </label>
          <button
            className="qr-btn"
            onClick={() => {
              setTotal(total + (extra ? 319 : 299));
              setQty(qty + 1);
              setCustom(false);
              setCheckout(false);
            }}
          >
            Add to demo cart
          </button>
        </fieldset>
      )}
      {qty > 0 && (
        <>
          <div className="qr-sample-line">
            <span>Demo cart · {qty} item(s)</span>
            <b>₹{total}</b>
          </div>
          <button
            className="qr-btn secondary"
            onClick={() => setCheckout(true)}
          >
            Preview checkout
          </button>
          <button
            className="qr-text-btn"
            onClick={() => {
              setQty(0);
              setTotal(0);
              setCheckout(false);
            }}
          >
            Clear demo cart
          </button>
        </>
      )}
      {checkout && (
        <div role="status" className="qr-demo-confirm">
          <h4>Checkout preview</h4>
          <p>Total ₹{total} · sample prices, no tax in this demo.</p>
          <p>
            Guests select a configured payment method here. This preview never
            opens a gateway or submits an order.
          </p>
        </div>
      )}
    </div>
  );
}
