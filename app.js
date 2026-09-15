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


// ===============================
// Firebase
// ===============================

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: "select_account"
});


// ===============================
// Global state
// ===============================

let currentUser = null;
let profile = null;
let services = [];
let cart = [];


// ===============================
// Statuses
// ===============================

const STATUS = {
  pending: {
    label: "بانتظار التحويل",
    className: "status-pending"
  },

  paid: {
    label: "تم استلام الإيصال",
    className: "status-paid"
  },

  progress: {
    label: "قيد التنفيذ",
    className: "status-progress"
  },

  ready: {
    label: "جاهز",
    className: "status-ready"
  },

  completed: {
    label: "مكتمل",
    className: "status-completed"
  },

  cancelled: {
    label: "ملغي",
    className: "status-cancelled"
  }
};


// ===============================
// Helpers
// ===============================

const $ = (selector) => document.querySelector(selector);

const $$ = (selector) =>
  Array.from(document.querySelectorAll(selector));


function showToast(message, isError = false) {
  const element = $("#toast");

  if (!element) {
    return;
  }

  element.textContent = message;

  element.className =
    "toast show" + (isError ? " error" : "");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    element.classList.remove("show");
  }, 3500);
}


function openModal(id) {
  const element = $(id);

  if (!element) {
    return;
  }

  element.classList.remove("hidden");

  document.body.classList.add("modal-open");
}


function closeModal(id) {
  const element = $(id);

  if (!element) {
    return;
  }

  element.classList.add("hidden");

  document.body.classList.remove("modal-open");
}


function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function money(value) {
  return Number(value || 0).toFixed(2) + " ر.س";
}


function formatDate(timestamp) {
  if (!timestamp) {
    return "—";
  }

  const date =
    typeof timestamp.toDate === "function"
      ? timestamp.toDate()
      : new Date(timestamp);

  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}


function emptyState(title, text) {
  return `
    <div class="empty-state">
      <div class="empty-icon">✦</div>

      <h3>
        ${escapeHTML(title)}
      </h3>

      <p>
        ${escapeHTML(text)}
      </p>
    </div>
  `;
}


function switchView(name) {
  const target = $(`#view-${name}`);

  if (!target) {
    return;
  }

  $$(".view").forEach((view) => {
    view.classList.remove("active");
  });

  target.classList.add("active");

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


// ===============================
// Navigation
// ===============================

function updateNavigation() {
  const loggedIn = Boolean(currentUser);

  $("#mainNav")?.classList.toggle(
    "hidden",
    !loggedIn
  );

  $("#logoutBtn")?.classList.toggle(
    "hidden",
    !loggedIn
  );

  $("#openAuthBtn")?.classList.toggle(
    "hidden",
    loggedIn
  );

  $("#cartBtn")?.classList.toggle(
    "hidden",
    !loggedIn
  );

  $("#welcomeUser")?.classList.toggle(
    "hidden",
    !loggedIn
  );

  $("#adminNav")?.classList.toggle(
    "hidden",
    profile?.role !== "admin"
  );

  if ($("#welcomeUser")) {
    $("#welcomeUser").textContent = loggedIn
      ? `أهلًا ${profile?.name || currentUser.email || ""}`
      : "";
  }

  updateCartCount();
}


// ===============================
// Google Login
// ===============================

async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(
      auth,
      googleProvider
    );

    const user = result.user;

    const userRef = doc(
      db,
      "users",
      user.uid
    );

    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) {
      await setDoc(userRef, {
        name: user.displayName || "",
        email: user.email || "",
        photoURL: user.photoURL || "",
        role: "student",
        className: "",
        phone: "",
        createdAt: serverTimestamp()
      });
    }

    await loadProfile(user);

    closeModal("#authModal");

    updateNavigation();

    renderProfile();

    showToast(
      "تم تسجيل الدخول باستخدام Google"
    );

    if (
      !profile?.name ||
      !profile?.className
    ) {
      switchView("profile");

      showToast(
        "أكمل اسمك وشعبتك أولًا"
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
      "auth/cancelled-popup-request"
    ) {
      return;
    }

    if (
      error.code ===
      "auth/popup-blocked"
    ) {
      showToast(
        "اسمح بالنوافذ المنبثقة لهذا الموقع.",
        true
      );

      return;
    }

    if (
      error.code ===
      "auth/unauthorized-domain"
    ) {
      showToast(
        "أضف دومين الموقع إلى Authorized domains في Firebase.",
        true
      );

      return;
    }

    console.error(error);

    showToast(
      "فشل تسجيل الدخول بواسطة Google.",
      true
    );
  }
}


// ===============================
// Profile
// ===============================

async function loadProfile(user) {
  if (!user) {
    profile = null;
    return;
  }

  const reference = doc(
    db,
    "users",
    user.uid
  );

  const snapshot = await getDoc(
    reference
  );

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
    phone: ""
  };

  await setDoc(
    reference,
    {
      ...profile,
      createdAt: serverTimestamp()
    }
  );
}


function renderProfile() {
  if (!currentUser || !profile) {
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
    $("#profileName").textContent = name;
  }

  if ($("#profileEmail")) {
    $("#profileEmail").textContent =
      email;
  }

  if ($("#profileAvatar")) {
    $("#profileAvatar").textContent =
      name.trim().charAt(0) || "ط";
  }

  if ($("#profileNameInput")) {
    $("#profileNameInput").value = name;
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
    $("#profileNameInput")?.value.trim() || "";

  const className =
    $("#profileClassInput")?.value.trim() || "";

  const phone =
    $("#profilePhoneInput")?.value.trim() || "";

  if (!name) {
    showToast(
      "اكتب الاسم الكامل.",
      true
    );

    return;
  }

  if (!className) {
    showToast(
      "اكتب الشعبة.",
      true
    );

    return;
  }

  try {
    await setDoc(
      doc(
        db,
        "users",
        currentUser.uid
      ),
      {
        name,
        className,
        phone
      },
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
      name,
      className,
      phone
    };

    renderProfile();

    updateNavigation();

    showToast(
      "تم حفظ الملف الشخصي."
    );

  } catch (error) {
    console.error(error);

    showToast(
      "تعذر حفظ البيانات.",
      true
    );
  }
}


// ===============================
// Services
// ===============================

function serviceCard(service) {
  return `
    <article class="service-card">

      <div class="service-icon">
        ${escapeHTML(
          service.icon || "📚"
        )}
      </div>

      <div class="service-content">

        <div class="service-title-row">

          <h3>
            ${escapeHTML(
              service.name
            )}
          </h3>

          <span class="price">
            ${money(service.price)}
          </span>

        </div>

        <p>
          ${escapeHTML(
            service.description || ""
          )}
        </p>

        <button
          type="button"
          class="btn btn-small btn-secondary add-cart"
          data-id="${service.id}"
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
        );

    services.sort(
      (a, b) =>
        (b.createdAt?.seconds || 0) -
        (a.createdAt?.seconds || 0)
    );

  } catch (error) {
    console.error(
      "Load Services Error:",
      error
    );

    services = [];

    showToast(
      "تعذر تحميل الخدمات. تحقق من Firestore.",
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
        "سيتم إضافة الخدمات قريبًا."
      );
  }
}


// ===============================
// Cart
// ===============================

function updateCartCount() {
  const count =
    cart.reduce(
      (sum, item) =>
        sum + item.qty,
      0
    );

  if ($("#cartCount")) {
    $("#cartCount").textContent =
      String(count);
  }
}


function addToCart(serviceId) {
  if (!currentUser) {
    openModal("#authModal");

    showToast(
      "سجل الدخول أولًا.",
      true
    );

    return;
  }

  if (
    !profile?.name ||
    !profile?.className
  ) {
    switchView("profile");

    showToast(
      "أكمل اسمك وشعبتك أولًا.",
      true
    );

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
      price: Number(
        service.price || 0
      ),
      qty: 1
    });
  }

  updateCartCount();

  showToast(
    "تمت إضافة الخدمة إلى السلة."
  );
}


function renderCart() {
  const container =
    $("#cartItems");

  if (!container) {
    return;
  }

  if (!cart.length) {

    container.innerHTML =
      emptyState(
        "السلة فارغة",
        "أضف الخدمات التي تحتاجها."
      );

    if ($("#cartTotal")) {
      $("#cartTotal").textContent =
        money(0);
    }

    if ($("#checkoutBtn")) {
      $("#checkoutBtn").disabled =
        true;
    }

    return;
  }

  container.innerHTML =
    cart
      .map(
        (item, index) => `
          <div class="cart-row">

            <div>

              <b>
                ${escapeHTML(
                  item.name
                )}
              </b>

              <small>
                ${money(
                  item.price
                )}
                ×
                ${item.qty}
              </small>

            </div>


            <div class="cart-actions">

              <button
                type="button"
                class="qty"
                data-i="${index}"
                data-d="-1"
              >
                −
              </button>

              <span>
                ${item.qty}
              </span>

              <button
                type="button"
                class="qty"
                data-i="${index}"
                data-d="1"
              >
                +
              </button>

              <button
                type="button"
                class="remove"
                data-i="${index}"
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


function getCartTotal() {
  return cart.reduce(
    (sum, item) =>
      sum +
      item.price *
        item.qty,
    0
  );
}


// ===============================
// Checkout
// ===============================

function prepareCheckout() {
  if (!currentUser) {
    openModal("#authModal");
    return;
  }

  if (!cart.length) {
    showToast(
      "السلة فارغة.",
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

  closeModal(
    "#cartModal"
  );

  openModal(
    "#checkoutModal"
  );
}


async function createOrder() {

  if (!currentUser) {
    openModal("#authModal");
    return;
  }

  if (!cart.length) {
    showToast(
      "السلة فارغة.",
      true
    );
    return;
  }

  const note =
    $("#checkoutNote")?.value.trim() ||
    "";

  if (note.length < 5) {
    showToast(
      "اكتب تفاصيل الطلب.",
      true
    );
    return;
  }

  const total =
    getCartTotal();

  try {

    const order =
      await addDoc(
        collection(
          db,
          "orders"
        ),
        {
          userId:
            currentUser.uid,

          studentName:
            profile?.name || "",

          className:
            profile?.className || "",

          studentEmail:
            currentUser.email || "",

          phone:
            profile?.phone || "",

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

          description:
            note,

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


    const shortId =
      order.id
        .substring(
          0,
          8
        )
        .toUpperCase();


    const whatsapp =
      String(
        storeConfig.whatsapp ||
        ""
      ).replace(
        /\D/g,
        ""
      );


    if (!whatsapp) {
      showToast(
        "ضع رقم الواتساب في firebase-config.js.",
        true
      );

      return;
    }


    const message =
`السلام عليكم 👋

أرسلت طلبًا من موقع خدمات طلاب جابر بن حيان

رقم الطلب: #${shortId}
الاسم: ${profile?.name || ""}
الشعبة: ${profile?.className || ""}
المبلغ: ${money(total)}

سأرسل إيصال التحويل مع هذه الرسالة.`;


    cart = [];

    updateCartCount();


    if ($("#checkoutNote")) {
      $("#checkoutNote").value = "";
    }


    closeModal(
      "#checkoutModal"
    );


    switchView(
      "orders"
    );


    window.open(
      `https://wa.me/${whatsapp}?text=${encodeURIComponent(
        message
      )}`,
      "_blank"
    );


    showToast(
      `تم إنشاء الطلب #${shortId}`
    );


  } catch (error) {

    console.error(
      "Create Order Error:",
      error
    );

    showToast(
      "تعذر إنشاء الطلب. تحقق من Firestore وقواعد الأمان.",
      true
    );
  }
}


// ===============================
// Orders
// ===============================

async function renderOrders() {

  const container =
    $("#ordersList");

  if (!container) {
    return;
  }

  if (!currentUser) {
    container.innerHTML =
      emptyState(
        "سجل الدخول أولًا",
        "سجل الدخول لمشاهدة طلباتك."
      );

    return;
  }

  container.innerHTML =
    `<div class="loading">جاري التحميل...</div>`;

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
        );


    orders.sort(
      (a, b) =>
        (b.createdAt?.seconds || 0) -
        (a.createdAt?.seconds || 0)
    );


    if (!orders.length) {

      container.innerHTML =
        emptyState(
          "لا توجد طلبات",
          "ابدأ بإضافة خدمة إلى السلة."
        );

      return;
    }


    container.innerHTML =
      orders
        .map(
          (order) => {

            const status =
              STATUS[
                order.status
              ] ||
              STATUS.pending;


            const items =
              order.items
                ?.map(
                  (item) =>
                    escapeHTML(
                      item.name
                    )
                )
                .join("، ") ||
              "طلب";


            return `
              <article
                class="order-card-row"
              >

                <div
                  class="order-main"
                >

                  <div
                    class="order-id"
                  >
                    #${escapeHTML(
                      order.id
                        .substring(
                          0,
                          8
                        )
                        .toUpperCase()
                    )}
                  </div>


                  <h3>
                    ${items}
                  </h3>


                  <p>
                    ${escapeHTML(
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


                <div
                  class="order-meta"
                >

                  <span
                    class="status-pill ${status.className}"
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

                          ${escapeHTML(
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
      "Render Orders Error:",
      error
    );

    container.innerHTML =
      emptyState(
        "تعذر تحميل الطلبات",
        "تحقق من إعداد Firestore."
      );
  }
}


// ===============================
// Admin default services
// ===============================

async function seedServices() {

  if (
    profile?.role !==
    "admin"
  ) {
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
        "إعداد مشروع مدرسي حسب المتطلبات المحددة.",

      price:
        30,

      icon:
        "🧩"
    },


    {
      name:
        "حل واجبات",

      description:
        "مساعدة تعليمية في الحل والمراجعة.",

      price:
        15,

      icon:
        "📝"
    },


    {
      name:
        "خدمة طلابية إضافية",

      description:
        "خدمة قابلة للتعديل من لوحة الإدارة.",

      price:
        10,

      icon:
        "✨"
    },


    {
      name:
        "اختبار محاكاة",

      description:
        "اختبار تدريبي مبني على المحدد للتدرب قبل الاختبار.",

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


// ===============================
// Admin
// ===============================

function adminOrderCard(order) {

  const status =
    STATUS[
      order.status
    ] ||
    STATUS.pending;

  const items =
    order.items
      ?.map(
        (item) =>
          `${escapeHTML(
            item.name
          )} × ${item.qty}`
      )
      .join("، ") ||
    "طلب";


  return `
    <article
      class="admin-order"
    >

      <div
        class="admin-order-head"
      >

        <div>

          <b>
            #${escapeHTML(
              order.id
                .substring(
                  0,
                  8
                )
                .toUpperCase()
            )}
          </b>

          <span
            class="status-pill ${status.className}"
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
        ${items}
      </h3>


      <p>
        ${escapeHTML(
          order.description ||
          ""
        )}
      </p>


      <div
        class="admin-customer"
      >

        <span>
          الطالب:
          ${escapeHTML(
            order.studentName ||
            "—"
          )}
        </span>

        <span>
          الشعبة:
          ${escapeHTML(
            order.className ||
            "—"
          )}
        </span>

        <span>
          البريد:
          ${escapeHTML(
            order.studentEmail ||
            "—"
          )}
        </span>

        <span>
          الهاتف:
          ${escapeHTML(
            order.phone ||
            "—"
          )}
        </span>

      </div>


      <div
        class="admin-actions"
      >

        <select
          class="status-select"
          data-order="${order.id}"
        >

          ${
            Object.keys(
              STATUS
            )
              .map(
                (key) =>
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
                        STATUS[key]
                          .label
                      }
                    </option>
                  `
              )
              .join("")
          }

        </select>


        <input
          data-order-note="${order.id}"
          value="${escapeHTML(
            order.adminNote ||
            ""
          )}"
          placeholder="ملاحظة للطالب"
        />


        <button
          type="button"
          class="btn btn-small btn-primary save-order"
          data-id="${order.id}"
        >
          حفظ
        </button>

      </div>

    </article>
  `;
}


async function renderAdmin() {

  if (
    profile?.role !==
    "admin"
  ) {
    showToast(
      "ليس لديك صلاحية الإدارة.",
      true
    );

    return;
  }


  try {

    await seedServices();

    await loadServices();


    const snapshot =
      await getDocs(
        collection(
          db,
          "orders"
        )
      );


    const orders =
      snapshot.docs.map(
        (item) => ({
          id: item.id,
          ...item.data()
        })
      );


    orders.sort(
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
            (service) =>
              `
                <div
                  class="service-admin-row"
                >

                  <span>
                    ${escapeHTML(
                      service.icon ||
                      "📚"
                    )}
                  </span>


                  <div>

                    <b>
                      ${escapeHTML(
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
                    type="button"
                    class="icon-btn delete-service"
                    data-id="${service.id}"
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

    showToast(
      "تعذر تحميل لوحة الإدارة.",
      true
    );
  }
}


// ===============================
// Admin actions
// ===============================

async function updateAdminOrder(
  orderId
) {

  if (
    profile?.role !==
    "admin"
  ) {
    return;
  }


  const select =
    document.querySelector(
      `.status-select[data-order="${orderId}"]`
    );


  const note =
    document.querySelector(
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


    showToast(
      "تم تحديث الطلب."
    );


    await renderAdmin();

  } catch (error) {

    console.error(
      "Update Order Error:",
      error
    );

    showToast(
      "تعذر تحديث الطلب.",
      true
    );
  }
}


async function addService(event) {

  event.preventDefault();


  if (
    profile?.role !==
    "admin"
  ) {
    return;
  }


  const form =
    new FormData(
      event.target
    );


  const name =
    String(
      form.get("name") ||
      ""
    ).trim();


  const description =
    String(
      form.get(
        "description"
      ) ||
      ""
    ).trim();


  const price =
    Number(
      form.get("price")
    );


  const icon =
    String(
      form.get("icon") ||
      "📚"
    ).trim();


  if (
    !name ||
    !Number.isFinite(
      price
    ) ||
    price < 0
  ) {

    showToast(
      "أدخل اسمًا وسعرًا صحيحين.",
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


    showToast(
      "تمت إضافة الخدمة."
    );


    await renderAdmin();

  } catch (error) {

    console.error(
      "Add Service Error:",
      error
    );

    showToast(
      "تعذر إضافة الخدمة.",
      true
    );
  }
}


async function deleteService(
  serviceId
) {

  if (
    profile?.role !==
    "admin"
  ) {
    return;
  }


  if (
    !confirm(
      "هل تريد حذف الخدمة؟"
    )
  ) {
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


    showToast(
      "تم حذف الخدمة."
    );


    await renderAdmin();

  } catch (error) {

    console.error(
      "Delete Service Error:",
      error
    );

    showToast(
      "تعذر حذف الخدمة.",
      true
    );
  }
}


// ===============================
// Global click handling
// ===============================

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
        [
          "orders",
          "profile",
          "admin"
        ].includes(view) &&
        !currentUser
      ) {

        openModal(
          "#authModal"
        );

        showToast(
          "سجل الدخول أولًا.",
          true
        );

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
        "#" +
        closeButton.dataset.close
      );

      return;
    }


    const qtyButton =
      event.target.closest(
        ".qty"
      );


    if (qtyButton) {

      const index =
        Number(
          qtyButton.dataset.i
        );


      const difference =
        Number(
          qtyButton.dataset.d
        );


      if (
        !cart[index]
      ) {
        return;
      }


      cart[index].qty +=
        difference;


      if (
        cart[index].qty <=
        0
      ) {

        cart.splice(
          index,
          1
        );
      }


      renderCart();

      updateCartCount();

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

      updateCartCount();

      return;
    }


    const saveButton =
      event.target.closest(
        ".save-order"
      );


    if (saveButton) {

      updateAdminOrder(
        saveButton.dataset.id
      );

      return;
    }


    const deleteButton =
      event.target.closest(
        ".delete-service"
      );


    if (deleteButton) {

      deleteService(
        deleteButton.dataset.id
      );
    }

  }
);


// ===============================
// Buttons
// ===============================

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

        currentUser =
          null;

        profile =
          null;

        cart = [];

        updateNavigation();

        switchView(
          "home"
        );

        showToast(
          "تم تسجيل الخروج."
        );

      } catch (error) {

        console.error(
          error
        );

        showToast(
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


// ===============================
// Firebase auth state
// ===============================

onAuthStateChanged(
  auth,
  async (user) => {

    currentUser =
      user || null;


    if (!user) {

      profile =
        null;

      updateNavigation();

      return;
    }


    try {

      await loadProfile(
        user
      );

      updateNavigation();

      renderProfile();

      await loadServices();

    } catch (error) {

      console.error(
        "Auth State Error:",
        error
      );

      showToast(
        "تعذر تحميل بيانات الحساب.",
        true
      );

    }

  }
);


// ===============================
// Startup
// ===============================

document.addEventListener(
  "DOMContentLoaded",
  async () => {

    if ($("#year")) {
      $("#year").textContent =
        String(
          new Date().getFullYear()
        );
    }

    await loadServices();

    updateNavigation();

  }
);
