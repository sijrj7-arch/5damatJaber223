```js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  setDoc,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import {
  firebaseConfig,
  storeConfig
} from "./firebase-config.js";


// ========================================
// Firebase
// ========================================

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: "select_account"
});


// ========================================
// Helpers
// ========================================

const $ = (selector) =>
  document.querySelector(selector);

const $$ = (selector) =>
  [...document.querySelectorAll(selector)];


let currentUser = null;
let profile = null;
let services = [];
let cart = [];


// ========================================
// Order Statuses
// ========================================

const statuses = {
  pending: {
    label: "بانتظار التحويل",
    cls: "status-pending"
  },

  paid: {
    label: "تم استلام الإيصال",
    cls: "status-paid"
  },

  progress: {
    label: "قيد التنفيذ",
    cls: "status-progress"
  },

  ready: {
    label: "جاهز",
    cls: "status-ready"
  },

  completed: {
    label: "مكتمل",
    cls: "status-completed"
  },

  cancelled: {
    label: "ملغي",
    cls: "status-cancelled"
  }
};


// ========================================
// UI
// ========================================

function toast(message, error = false) {
  const element = $("#toast");

  if (!element) return;

  element.textContent = message;

  element.className =
    `toast show ${error ? "error" : ""}`;

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    element.classList.remove("show");
  }, 3200);
}


function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function money(value) {
  return `${Number(value || 0).toFixed(2)} ر.س`;
}


function formatDate(timestamp) {
  if (!timestamp) {
    return "—";
  }

  const date = timestamp.toDate
    ? timestamp.toDate()
    : new Date(timestamp);

  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}


function openModal(id) {
  const element = $(id);

  if (!element) return;

  element.classList.remove("hidden");

  document.body.classList.add("modal-open");
}


function closeModal(id) {
  const element = $(id);

  if (!element) return;

  element.classList.add("hidden");

  document.body.classList.remove("modal-open");
}


function emptyState(title, text) {
  return `
    <div class="empty-state">
      <div class="empty-icon">✦</div>

      <h3>
        ${esc(title)}
      </h3>

      <p>
        ${esc(text)}
      </p>
    </div>
  `;
}


function switchView(name) {
  let target = $(`#view-${name}`);

  if (!target) {
    name = "home";
  }

  $$(".view").forEach((view) => {
    view.classList.remove("active");
  });

  const finalView = $(`#view-${name}`);

  if (!finalView) {
    return;
  }

  finalView.classList.add("active");

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  if (name === "orders") {
    renderOrders();
  }

  if (name === "profile") {
    renderProfile();
  }

  if (name === "admin") {
    renderAdmin();
  }
}


function requireLogin() {
  if (!currentUser) {
    openModal("#authModal");

    toast(
      "سجل الدخول أولًا",
      true
    );

    return false;
  }

  return true;
}


// ========================================
// Authentication
// ========================================

async function loginWithGoogle() {
  try {
    const result =
      await signInWithPopup(
        auth,
        googleProvider
      );

    const user = result.user;

    const userReference = doc(
      db,
      "users",
      user.uid
    );

    const existing =
      await getDoc(userReference);

    if (!existing.exists()) {
      await setDoc(
        userReference,
        {
          name: user.displayName || "",
          email: user.email || "",
          photoURL: user.photoURL || "",
          role: "student",
          className: "",
          phone: "",
          createdAt:
            serverTimestamp()
        }
      );
    }

    await loadProfile(user);

    closeModal("#authModal");

    nav();

    toast(
      "تم تسجيل الدخول بحساب Google"
    );

    if (
      !profile?.name ||
      !profile?.className
    ) {
      switchView("profile");

      toast(
        "أكمل بيانات ملفك الشخصي"
      );
    }

  } catch (error) {
    console.error(
      "Google Login Error:",
      error
    );

    if (
      error.code ===
      "auth/popup-closed-by-user"
    ) {
      return;
    }

    if (
      error.code ===
      "auth/popup-blocked"
    ) {
      toast(
        "المتصفح منع نافذة Google. اسمح بالنوافذ المنبثقة.",
        true
      );

      return;
    }

    if (
      error.code ===
      "auth/unauthorized-domain"
    ) {
      toast(
        "الدومين الحالي غير مضاف في Firebase Authentication.",
        true
      );

      return;
    }

    if (
      error.code ===
      "auth/cancelled-popup-request"
    ) {
      return;
    }

    toast(
      "تعذر تسجيل الدخول بحساب Google.",
      true
    );
  }
}


// ========================================
// Profile
// ========================================

async function loadProfile(user) {
  if (!user) {
    profile = null;
    return;
  }

  const reference =
    doc(db, "users", user.uid);

  const snapshot =
    await getDoc(reference);

  if (snapshot.exists()) {
    profile = snapshot.data();
    return;
  }

  profile = {
    name: user.displayName || "",
    email: user.email || "",
    photoURL: user.photoURL || "",
    role: "student",
    className: "",
    phone: "",
    createdAt:
      serverTimestamp()
  };

  await setDoc(
    reference,
    profile
  );
}


function renderProfile() {
  if (!profile || !currentUser) {
    return;
  }

  const name =
    profile.name ||
    currentUser.displayName ||
    "طالب";

  const email =
    profile.email ||
    currentUser.email ||
    "";

  if ($("#profileName")) {
    $("#profileName").textContent =
      name;
  }

  if ($("#profileEmail")) {
    $("#profileEmail").textContent =
      email;
  }

  if ($("#profileAvatar")) {
    $("#profileAvatar").textContent =
      name.trim().slice(0, 1) ||
      "ط";
  }

  if ($("#profileNameInput")) {
    $("#profileNameInput").value =
      name;
  }

  if ($("#profileClassInput")) {
    $("#profileClassInput").value =
      profile.className || "";
  }

  if ($("#profilePhoneInput")) {
    $("#profilePhoneInput").value =
      profile.phone || "";
  }
}


async function saveProfile(event) {
  event.preventDefault();

  if (!currentUser) {
    return;
  }

  const name =
    $("#profileNameInput")
      .value
      .trim();

  const className =
    $("#profileClassInput")
      .value
      .trim();

  const phone =
    $("#profilePhoneInput")
      .value
      .trim();

  if (!name) {
    toast(
      "اكتب اسمك الكامل",
      true
    );

    return;
  }

  if (!className) {
    toast(
      "اكتب شعبتك",
      true
    );

    return;
  }

  const data = {
    name,
    className,
    phone
  };

  try {
    await setDoc(
      doc(
        db,
        "users",
        currentUser.uid
      ),
      data,
      {
        merge: true
      }
    );

    await updateProfile(
      currentUser,
      {
        displayName: name
      }
    );

    profile = {
      ...profile,
      ...data
    };

    renderProfile();
    nav();

    toast(
      "تم حفظ الملف الشخصي"
    );

  } catch (error) {
    console.error(error);

    toast(
      "تعذر حفظ بيانات الملف.",
      true
    );
  }
}


// ========================================
// Navigation
// ========================================

function nav() {
  const loggedIn =
    Boolean(currentUser);

  $("#mainNav")
    ?.classList
    .toggle(
      "hidden",
      !loggedIn
    );

  $("#logoutBtn")
    ?.classList
    .toggle(
      "hidden",
      !loggedIn
    );

  $("#openAuthBtn")
    ?.classList
    .toggle(
      "hidden",
      loggedIn
    );

  $("#cartBtn")
    ?.classList
    .toggle(
      "hidden",
      !loggedIn
    );

  $("#welcomeUser")
    ?.classList
    .toggle(
      "hidden",
      !loggedIn
    );

  if ($("#welcomeUser")) {
    $("#welcomeUser").textContent =
      loggedIn
        ? `أهلًا ${profile?.name || currentUser.email}`
        : "";
  }

  $("#adminNav")
    ?.classList
    .toggle(
      "hidden",
      profile?.role !== "admin"
    );

  updateCart();
}


// ========================================
// Services
// ========================================

function serviceCard(service) {
  return `
    <article class="service-card">

      <div class="service-icon">
        ${esc(service.icon || "📚")}
      </div>

      <div class="service-content">

        <div class="service-title-row">

          <h3>
            ${esc(service.name)}
          </h3>

          <span class="price">
            ${money(service.price)}
          </span>

        </div>

        <p>
          ${esc(
            service.description || ""
          )}
        </p>

        <button
          class="btn btn-small btn-secondary add-cart"
          data-id="${service.id}"
          type="button"
        >
          أضف للسلة
        </button>

      </div>

    </article>
  `;
}


async function loadServices() {
  try {
    const snapshot =
      await getDocs(
        collection(
          db,
          "services"
        )
      );

    services =
      snapshot.docs
        .map((item) => ({
          id: item.id,
          ...item.data()
        }))
        .filter(
          (item) =>
            item.active !== false
        )
        .sort(
          (a, b) =>
            (b.createdAt?.seconds || 0) -
            (a.createdAt?.seconds || 0)
        );

  } catch (error) {
    console.error(
      "Services Error:",
      error
    );

    services = [];

    toast(
      "تعذر تحميل الخدمات. تأكد من Firestore.",
      true
    );
  }

  if ($("#servicesGrid")) {
    $("#servicesGrid").innerHTML =
      services.length
        ? services
            .map(serviceCard)
            .join("")
        : emptyState(
            "لا توجد خدمات",
            "سيتم إضافة الخدمات قريبًا."
          );
  }

  if ($("#homeServices")) {
    $("#homeServices").innerHTML =
      services
        .slice(0, 3)
        .map(serviceCard)
        .join("") ||
      emptyState(
        "لا توجد خدمات",
        "لم تتم إضافة الخدمات بعد."
      );
  }
}


// ========================================
// Cart
// ========================================

function updateCart() {
  const count =
    cart.reduce(
      (sum, item) =>
        sum + item.qty,
      0
    );

  if ($("#cartCount")) {
    $("#cartCount").textContent =
      count;
  }
}


function addToCart(serviceId) {
  if (!requireLogin()) {
    return;
  }

  const service =
    services.find(
      (item) =>
        item.id === serviceId
    );

  if (!service) {
    return;
  }

  if (
    !profile?.name ||
    !profile?.className
  ) {
    switchView("profile");

    toast(
      "أكمل اسمك وشعبتك قبل الطلب.",
      true
    );

    return;
  }

  const existing =
    cart.find(
      (item) =>
        item.id === serviceId
    );

  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({
      id: service.id,
      name: service.name,
      price:
        Number(
          service.price || 0
        ),
      qty: 1
    });
  }

  updateCart();

  toast(
    "تمت إضافة الخدمة إلى السلة"
  );
}


function renderCart() {
  const box =
    $("#cartItems");

  if (!box) {
    return;
  }

  if (!cart.length) {
    box.innerHTML =
      emptyState(
        "السلة فارغة",
        "أضف الخدمات التي تحتاجها."
      );

    if ($("#checkoutBtn")) {
      $("#checkoutBtn").disabled =
        true;
    }

    if ($("#cartTotal")) {
      $("#cartTotal").textContent =
        money(0);
    }

    return;
  }

  box.innerHTML =
    cart
      .map(
        (item, index) => `
          <div class="cart-row">

            <div>

              <b>
                ${esc(item.name)}
              </b>

              <small>
                ${money(item.price)}
                ×
                ${item.qty}
              </small>

            </div>


            <div class="cart-actions">

              <button
                class="qty"
                data-i="${index}"
                data-d="-1"
                type="button"
              >
                −
              </button>

              <span>
                ${item.qty}
              </span>

              <button
                class="qty"
                data-i="${index}"
                data-d="1"
                type="button"
              >
                +
              </button>

              <button
                class="remove"
                data-i="${index}"
                type="button"
              >
                حذف
              </button>

            </div>

          </div>
        `
      )
      .join("");

  const total =
    cart.reduce(
      (sum, item) =>
        sum +
        item.price *
        item.qty,
      0
    );

  if ($("#cartTotal")) {
    $("#cartTotal").textContent =
      money(total);
  }

  if ($("#checkoutBtn")) {
    $("#checkoutBtn").disabled =
      false;
  }
}


// ========================================
// Checkout
// ========================================

function getCartTotal() {
  return cart.reduce(
    (sum, item) =>
      sum +
      item.price *
      item.qty,
    0
  );
}


function copyText(text, message) {
  navigator.clipboard
    ?.writeText(text)
    .then(() => {
      toast(message);
    })
    .catch(() => {
      toast(
        "تعذر النسخ تلقائيًا.",
        true
      );
    });
}


function prepareCheckout() {
  if (!requireLogin()) {
    return;
  }

  if (!cart.length) {
    toast(
      "السلة فارغة",
      true
    );

    return;
  }

  if ($("#bankName")) {
    $("#bankName").textContent =
      storeConfig.bankName ||
      "—";
  }

  if ($("#beneficiary")) {
    $("#beneficiary").textContent =
      storeConfig.beneficiary ||
      "—";
  }

  if ($("#iban")) {
    $("#iban").textContent =
      storeConfig.iban ||
      "—";
  }

  if ($("#payAmount")) {
    $("#payAmount").textContent =
      money(
        getCartTotal()
      );
  }

  closeModal("#cartModal");

  openModal("#checkoutModal");
}


async function createOrder() {
  if (!requireLogin()) {
    return;
  }

  if (!cart.length) {
    toast(
      "السلة فارغة.",
      true
    );

    return;
  }

  const description =
    $("#checkoutNote")
      .value
      .trim();

  if (description.length < 5) {
    toast(
      "اكتب تفاصيل الطلب أولًا.",
      true
    );

    return;
  }

  const total =
    getCartTotal();

  try {
    const orderReference =
      await addDoc(
        collection(
          db,
          "orders"
        ),
        {
          userId:
            currentUser.uid,

          studentName:
            profile.name,

          className:
            profile.className,

          studentEmail:
            currentUser.email || "",

          phone:
            profile.phone || "",

          items:
            cart.map(
              (item) => ({
                serviceId:
                  item.id,

                name:
                  item.name,

                price:
                  item.price,

                qty:
                  item.qty
              })
            ),

          total,

          description,

          status:
            "pending",

          adminNote:
            "",

          createdAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp()
        }
      );

    const orderId =
      orderReference.id
        .slice(0, 8)
        .toUpperCase();

    const whatsappNumber =
      String(
        storeConfig.whatsapp ||
        ""
      ).replace(
        /\D/g,
        ""
      );

    if (!whatsappNumber) {
      toast(
        "أضف رقم الواتساب في firebase-config.js",
        true
      );

      return;
    }

    const message =
`السلام عليكم 👋
أرسلت طلبًا من موقع خدمات طلاب جابر بن حيان

رقم الطلب: #${orderId}
الاسم: ${profile.name}
الشعبة: ${profile.className}
المبلغ: ${money(total)}

سأرسل إيصال التحويل مع هذه الرسالة.`;

    cart = [];

    updateCart();

    if ($("#checkoutNote")) {
      $("#checkoutNote").value =
        "";
    }

    closeModal(
      "#checkoutModal"
    );

    closeModal(
      "#cartModal"
    );

    switchView(
      "orders"
    );

    const url =
      `https://wa.me/${whatsappNumber}` +
      `?text=${encodeURIComponent(message)}`;

    window.open(
      url,
      "_blank"
    );

    toast(
      `تم إنشاء الطلب #${orderId}`
    );

  } catch (error) {
    console.error(
      "Create Order Error:",
      error
    );

    toast(
      "تعذر إنشاء الطلب. تأكد من Firestore وقواعد الأمان.",
      true
    );
  }
}


// ========================================
// Student Orders
// ========================================

async function renderOrders() {
  const box =
    $("#ordersList");

  if (!box) {
    return;
  }

  if (!currentUser) {
    box.innerHTML =
      emptyState(
        "سجل الدخول أولًا",
        "سجل الدخول لمشاهدة طلباتك."
      );

    return;
  }

  box.innerHTML =
    `
      <div class="loading">
        جاري تحميل الطلبات...
      </div>
    `;

  try {
    const snapshot =
      await getDocs(
        collection(
          db,
          "orders"
        )
      );

    const orders =
      snapshot.docs
        .map(
          (item) => ({
            id: item.id,
            ...item.data()
          })
        )
        .filter(
          (order) =>
            order.userId ===
            currentUser.uid
        )
        .sort(
          (a, b) =>
            (b.createdAt?.seconds || 0) -
            (a.createdAt?.seconds || 0)
        );

    if (!orders.length) {
      box.innerHTML =
        emptyState(
          "لا توجد طلبات",
          "ابدأ بإضافة خدمة إلى السلة."
        );

      return;
    }

    box.innerHTML =
      orders
        .map(
          (order) => {

            const status =
              statuses[
                order.status
              ] ||
              statuses.pending;

            return `
              <article
                class="order-card-row"
              >

                <div class="order-main">

                  <div
                    class="order-id"
                  >
                    #${esc(
                      order.id
                        .slice(
                          0,
                          8
                        )
                        .toUpperCase()
                    )}
                  </div>

                  <h3>
                    ${
                      order.items
                        ?.map(
                          (item) =>
                            esc(
                              item.name
                            )
                        )
                        .join(
                          "، "
                        ) ||
                      "طلب"
                    }
                  </h3>

                  <p>
                    ${esc(
                      order.description ||
                      ""
                    )}
                  </p>

                  <small>
                    ${formatDate(
                      order.createdAt
                    )}
                  </small>

                </div>


                <div class="order-meta">

                  <span
                    class="status-pill ${status.cls}"
                  >
                    ${status.label}
                  </span>

                  <strong>
                    ${money(
                      order.total
                    )}
                  </strong>


                  ${
                    order.adminNote
                      ? `
                        <div
                          class="admin-note"
                        >
                          <b>
                            ملاحظة الإدارة:
                          </b>

                          ${esc(
                            order.adminNote
                          )}
                        </div>
                      `
                      : ""
                  }

                </div>

              </article>
            `;
          }
        )
        .join("");

  } catch (error) {
    console.error(
      "Orders Error:",
      error
    );

    box.innerHTML =
      emptyState(
        "تعذر تحميل الطلبات",
        "تأكد من إعداد Firestore."
      );
  }
}


// ========================================
// Default Services
// ========================================

async function seedDefaultServices() {
  if (profile?.role !== "admin") {
    return;
  }

  const snapshot =
    await getDocs(
      collection(
        db,
        "services"
      )
    );

  if (!snapshot.empty) {
    return;
  }

  const defaults = [

    {
      name:
        "إنشاء بحوث احترافية + QR",

      description:
        "بحث منظم واحترافي مع إضافة باركود QR خاص بالبحث.",

      price:
        9.99,

      icon:
        "📚"
    },


    {
      name:
        "إنشاء مشاريع للمعلمين",

      description:
        "إعداد مشاريع مدرسية حسب المتطلبات المحددة.",

      price:
        30,

      icon:
        "🧩"
    },


    {
      name:
        "حل واجبات",

      description:
        "مساعدة تعليمية في حل ومراجعة الواجبات.",

      price:
        15,

      icon:
        "📝"
    },


    {
      name:
        "خدمة طلابية إضافية",

      description:
        "خدمة إضافية قابلة للتعديل من لوحة الإدارة.",

      price:
        10,

      icon:
        "✨"
    },


    {
      name:
        "اختبار محاكاة",

      description:
        "اختبار تدريبي مبني على المحدد الذي يرسله المعلم للتدرب قبل الاختبار.",

      price:
        13.99,

      icon:
        "🎯"
    },


    {
      name:
        "إنشاء مشروع تخرج بالكامل",

      description:
        "تجهيز وتنظيم مشروع التخرج بحسب متطلبات المدرسة.",

      price:
        50,

      icon:
        "🎓"
    }

  ];


  for (
    const service of defaults
  ) {

    await addDoc(
      collection(
        db,
        "services"
      ),
      {
        ...service,
        active:
          true,
        createdAt:
          serverTimestamp()
      }
    );
  }
}


// ========================================
// Admin
// ========================================

async function renderAdmin() {
  if (profile?.role !== "admin") {
    toast(
      "ليس لديك صلاحية الإدارة.",
      true
    );

    return;
  }

  try {
    await seedDefaultServices();

    await loadServices();

    const snapshot =
      await getDocs(
        collection(
          db,
          "orders"
        )
      );

    const orders =
      snapshot.docs
        .map(
          (item) => ({
            id: item.id,
            ...item.data()
          })
        )
        .sort(
          (a, b) =>
            (b.createdAt?.seconds || 0) -
            (a.createdAt?.seconds || 0)
        );


    if ($("#statAll")) {
      $("#statAll").textContent =
        orders.length;
    }

    if ($("#statPending")) {
      $("#statPending").textContent =
        orders.filter(
          (order) =>
            order.status ===
            "pending"
        ).length;
    }

    if ($("#statProgress")) {
      $("#statProgress").textContent =
        orders.filter(
          (order) =>
            order.status ===
            "progress"
        ).length;
    }

    if ($("#statCompleted")) {
      $("#statCompleted").textContent =
        orders.filter(
          (order) =>
            order.status ===
            "completed"
        ).length;
    }


    if ($("#adminOrders")) {
      $("#adminOrders").innerHTML =
        orders.length
          ? orders
              .map(
                adminOrderCard
              )
              .join("")
          : emptyState(
              "لا توجد طلبات",
              "ستظهر طلبات الطلاب هنا."
            );
    }


    if ($("#adminServices")) {
      $("#adminServices").innerHTML =
        services
          .map(
            (service) => `
              <div
                class="service-admin-row"
              >

                <span>
                  ${esc(
                    service.icon ||
                    "📚"
                  )}
                </span>

                <div>

                  <b>
                    ${esc(
                      service.name
                    )}
                  </b>

                  <small>
                    ${money(
                      service.price
                    )}
                  </small>

                </div>

                <button
                  class="icon-btn delete-service"
                  data-id="${service.id}"
                  type="button"
                >
                  حذف
                </button>

              </div>
            `
          )
          .join("");
    }

  } catch (error) {
    console.error(
      "Admin Error:",
      error
    );

    toast(
      "تعذر تحميل لوحة الإدارة.",
      true
    );
  }
}


function adminOrderCard(order) {
  const status =
    statuses[
      order.status
    ] ||
    statuses.pending;

  return `
    <article
      class="admin-order"
    >

      <div
        class="admin-order-head"
      >

        <div>

          <b>
            #${esc(
              order.id
                .slice(
                  0,
                  8
                )
                .toUpperCase()
            )}
          </b>

          <span
            class="status-pill ${status.cls}"
          >
            ${status.label}
          </span>

        </div>

        <strong>
          ${money(
            order.total
          )}
        </strong>

      </div>


      <h3>
        ${
          order.items
            ?.map(
              (item) =>
                `${esc(
                  item.name
                )} × ${item.qty}`
            )
            .join(
              "، "
            ) ||
          "طلب"
        }
      </h3>


      <p>
        ${esc(
          order.description ||
          ""
        )}
      </p>


      <div
        class="admin-customer"
      >

        <span>
          الطالب:
          ${esc(
            order.studentName ||
            "—"
          )}
        </span>

        <span>
          الشعبة:
          ${esc(
            order.className ||
            "—"
          )}
        </span>

        <span>
          البريد:
          ${esc(
            order.studentEmail ||
            "—"
          )}
        </span>

        <span>
          الهاتف:
          ${esc(
            order.phone ||
            "—"
          )}
        </span>

      </div>


      <div
        class="admin-actions"
      >

        <select
          data-order="${order.id}"
          class="status-select"
        >

          ${
            Object.entries(
              statuses
            )
              .map(
                ([key, value]) =>
                  `
                    <option
                      value="${key}"
                      ${
                        order.status ===
                        key
                          ? "selected"
                          : ""
                      }
                    >
                      ${
                        value.label
                      }
                    </option>
                  `
              )
              .join("")
          }

        </select>


        <input
          data-order-note="${order.id}"
          value="${esc(
            order.adminNote ||
            ""
          )}"
          placeholder="ملاحظة للطالب"
        />


        <button
          class="btn btn-small btn-primary save-order"
          data-id="${order.id}"
          type="button"
        >
          حفظ
        </button>

      </div>

    </article>
  `;
}


async function updateAdminOrder(orderId) {
  if (profile?.role !== "admin") {
    return;
  }

  const select =
    $(
      `.status-select[data-order="${orderId}"]`
    );

  const note =
    $(
      `[data-order-note="${orderId}"]`
    );

  if (!select) {
    return;
  }

  try {
    await updateDoc(
      doc(
        db,
        "orders",
        orderId
      ),
      {
        status:
          select.value,

        adminNote:
          note?.value.trim() ||
          "",

        updatedAt:
          serverTimestamp()
      }
    );

    toast(
      "تم تحديث الطلب"
    );

    await renderAdmin();

  } catch (error) {
    console.error(
      "Update Order Error:",
      error
    );

    toast(
      "تعذر تحديث الطلب.",
      true
    );
  }
}


async function addService(event) {
  event.preventDefault();

  if (profile?.role !== "admin") {
    return;
  }

  const formData =
    new FormData(
      event.target
    );

  const name =
    String(
      formData.get("name") ||
      ""
    ).trim();

  const description =
    String(
      formData.get(
        "description"
      ) || ""
    ).trim();

  const price =
    Number(
      formData.get("price")
    );

  const icon =
    String(
      formData.get("icon") ||
      "📚"
    ).trim();


  if (!name) {
    toast(
      "أدخل اسم الخدمة.",
      true
    );

    return;
  }

  if (
    !Number.isFinite(price) ||
    price < 0
  ) {
    toast(
      "أدخل سعرًا صحيحًا.",
      true
    );

    return;
  }


  try {
    await addDoc(
      collection(
        db,
        "services"
      ),
      {
        name,
        description,
        price,
        icon:
          icon || "📚",
        active:
          true,
        createdAt:
          serverTimestamp()
      }
    );

    event.target.reset();

    toast(
      "تمت إضافة الخدمة"
    );

    await renderAdmin();

  } catch (error) {
    console.error(
      "Add Service Error:",
      error
    );

    toast(
      "تعذر إضافة الخدمة.",
      true
    );
  }
}


async function deleteService(
  serviceId
) {
  if (profile?.role !== "admin") {
    return;
  }

  const confirmed =
    confirm(
      "هل تريد حذف الخدمة؟"
    );

  if (!confirmed) {
    return;
  }

  try {
    await deleteDoc(
      doc(
        db,
        "services",
        serviceId
      )
    );

    toast(
      "تم حذف الخدمة"
    );

    await renderAdmin();

  } catch (error) {
    console.error(
      "Delete Service Error:",
      error
    );

    toast(
      "تعذر حذف الخدمة.",
      true
    );
  }
}


// ========================================
// Global Click Handler
// ========================================

document.addEventListener(
  "click",
  (event) => {

    const viewButton =
      event.target.closest(
        "[data-view]"
      );

    if (viewButton) {

      event.preventDefault();

      const view =
        viewButton.dataset.view;

      if (
        !currentUser &&
        [
          "orders",
          "profile",
          "admin"
        ].includes(view)
      ) {

        requireLogin();

        return;
      }

      switchView(view);

      return;
    }


    const addButton =
      event.target.closest(
        ".add-cart"
      );

    if (addButton) {

      addToCart(
        addButton.dataset.id
      );

      return;
    }


    const closeButton =
      event.target.closest(
        "[data-close]"
      );

    if (closeButton) {

      closeModal(
        `#${closeButton.dataset.close}`
      );

      return;
    }


    const quantityButton =
      event.target.closest(
        ".qty"
      );

    if (quantityButton) {

      const index =
        Number(
          quantityButton.dataset.i
        );

      const difference =
        Number(
          quantityButton.dataset.d
        );

      if (!cart[index]) {
        return;
      }

      cart[index].qty +=
        difference;

      if (
        cart[index].qty <= 0
      ) {
        cart.splice(
          index,
          1
        );
      }

      renderCart();
      updateCart();

      return;
    }


    const removeButton =
      event.target.closest(
        ".remove"
      );

    if (removeButton) {

      const index =
        Number(
          removeButton.dataset.i
        );

      cart.splice(
        index,
        1
      );

      renderCart();
      updateCart();

      return;
    }


    const saveOrderButton =
      event.target.closest(
        ".save-order"
      );

    if (saveOrderButton) {

      updateAdminOrder(
        saveOrderButton.dataset.id
      );

      return;
    }


    const deleteServiceButton =
      event.target.closest(
        ".delete-service"
      );

    if (deleteServiceButton) {

      deleteService(
        deleteServiceButton.dataset.id
      );

      return;
    }

  }
);


// ========================================
// Buttons
// ========================================

$("#openAuthBtn")
  ?.addEventListener(
    "click",
    () => {
      openModal(
        "#authModal"
      );
    }
  );


$("#heroLoginBtn")
  ?.addEventListener(
    "click",
    () => {

      if (currentUser) {
        switchView(
          "services"
        );

        return;
      }

      openModal(
        "#authModal"
      );
    }
  );


$("#googleLoginBtn")
  ?.addEventListener(
    "click",
    loginWithGoogle
  );


$("#logoutBtn")
  ?.addEventListener(
    "click",
    async () => {

      try {

        await signOut(
          auth
        );

        currentUser = null;
        profile = null;

        cart = [];

        updateCart();

        switchView(
          "home"
        );

        toast(
          "تم تسجيل الخروج"
        );

      } catch (error) {

        console.error(error);

        toast(
          "تعذر تسجيل الخروج.",
          true
        );
      }

    }
  );


$("#cartBtn")
  ?.addEventListener(
    "click",
    () => {

      renderCart();

      openModal(
        "#cartModal"
      );

    }
  );


$("#checkoutBtn")
  ?.addEventListener(
    "click",
    prepareCheckout
  );


$("#createOrderBtn")
  ?.addEventListener(
    "click",
    createOrder
  );


$("#profileForm")
  ?.addEventListener(
    "submit",
    saveProfile
  );


$("#serviceForm")
  ?.addEventListener(
    "submit",
    addService
  );


$("#refreshAdminBtn")
  ?.addEventListener(
    "click",
    renderAdmin
  );


$("#iban")
  ?.addEventListener(
    "click",
    () => {

      if (
        storeConfig.iban
      ) {

        copyText(
          storeConfig.iban,
          "تم نسخ الآيبان"
        );

      }

    }
  );


// ========================================
// Auth State
// ========================================

onAuthStateChanged(
  auth,
  async (user) => {

    currentUser =
      user || null;

    if (user) {

      try {

        await loadProfile(
          user
        );

        nav();

        await loadServices();

        renderProfile();

        if (
          !profile?.name ||
          !profile?.className
        ) {
          switchView(
            "profile"
          );
        }

      } catch (error) {

        console.error(
          "Auth State Error:",
          error
        );

        toast(
          "تعذر تحميل حسابك.",
          true
        );
      }

    } else {

      profile = null;

      nav();

    }
  }
);


// ========================================
// Initial Load
// ========================================

document.addEventListener(
  "DOMContentLoaded",
  async () => {

    if ($("#year")) {
      $("#year").textContent =
        new Date()
          .getFullYear();
    }

    await loadServices();

  }
);
```
