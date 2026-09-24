# Blume Arts — Handmade Online Ordering Website

A real, working online ordering website: HTML/CSS/JS front end + Firebase backend
(Firestore, Auth, Storage, Hosting), with a customer shop and an admin panel.

## 1. Create your Firebase project
1. Go to https://console.firebase.google.com → **Add project**.
2. In **Build → Authentication**, enable the **Email/Password** sign-in method,
   then create exactly one user under the **Users** tab — this is your admin login.
3. In **Build → Firestore Database**, create a database (production mode).
4. In **Build → Storage**, enable Storage (for product images).
5. In **Project settings → General → Your apps**, add a **Web app** and copy the
   config object it gives you.

## 2. Connect the site to your project
Open `js/firebase-config.js` and paste your config into the `firebaseConfig` object.
That single file is imported by both the shop (`app.js`) and the admin panel (`admin.js`).

## 3. Deploy the security rules
```
npm install -g firebase-tools
firebase login
firebase init firestore   # point it at firestore.rules in this folder
firebase deploy --only firestore:rules
```
`firestore.rules` already encodes the required permissions:
customers can read available products and create orders; only a signed-in
admin can create/edit/delete products, categories, orders and settings.

## 4. Add your first data
Log in at `admin.html` with the user you created in step 1, then:
- **Settings** → set your business name, phone, WhatsApp number (digits + country
  code, e.g. `447397536605`), email and Instagram — the shop reads these live.
- **Categories** → add a few (e.g. Pipe Cleaner Flowers, Bouquets, Gift Items).
- **Products** → add your products with images, price, stock and any custom
  fields you like (Flower Type, Occasion, Material, etc).

Everything an admin changes appears immediately on the shop — no redeploy needed.

## 5. Deploy the site
```
firebase init hosting     # public directory = this folder
firebase deploy --only hosting
```
Or drag the folder onto any static host (Netlify, Vercel, GitHub Pages) —
it's plain HTML/CSS/JS, no build step required.

## What's included
- **Customer site** (`index.html`, `css/style.css`, `js/app.js`): hero, about,
  dynamic shop grid pulled live from Firestore, search/filter/sort, product
  detail view, cart drawer, 5-step checkout, WhatsApp order message generation
  (auto-formatted, order saved to Firestore first), order confirmation screen,
  contact section fed by Settings, footer with a discreet Admin link.
- **Admin panel** (`admin.html`, `css/admin.css`, `js/admin.js`): secure Firebase
  Auth login, dashboard stats, full product CRUD with image upload to Storage
  and unlimited custom fields, category management, order list with status
  updates and a full order detail view, business settings editor.
- **PWA**: `manifest.json` + `service-worker.js` for installability and a
  basic offline app shell.

## Scope notes (what was simplified to keep this deliverable manageable)
- Design system is built with CSS variables + Google Fonts (Playfair Display /
  Cormorant Garamond for the script/serif brand voice, Poppins for body text)
  rather than the actual logo/Instagram screenshot files, since none were
  attached to this request — swap in your real logo by replacing the `.brand-mark`
  circle in `index.html`/`admin.html` with an `<img>` tag once you have the file.
  A brand color palette matching the spec (cream, blush, dusty rose, beige,
  brown) is already applied throughout.
- Order IDs are generated from a timestamp (`BA-XXXXXX`) rather than a strictly
  sequential counter — unique and collision-safe without needing a server
  function. Ask me if you'd like a true incrementing counter via a Cloud Function.
- Admin roles are single-tier (any authenticated user = admin), matching a
  one-owner business. Multi-staff role permissions would need custom claims.
- Product image management supports one main image with live preview and
  Storage upload; multiple/additional gallery images per product can be added
  the same way if you'd like that expanded.

Happy to extend any of these — just say which part to build out further.
