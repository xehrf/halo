const API_URL = "https://halo-api-nv9v.onrender.com";

function getToken() {
  return localStorage.getItem("token");
}

function setToken(token) {
  localStorage.setItem("token", token);
}

function clearToken() {
  localStorage.removeItem("token");
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = {
    ...(options.headers || {}),
  };

  const hasBody = options.body !== undefined && options.body !== null;
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

  if (!isFormData) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method: options.method || "GET",
    headers,
    body: hasBody ? (isFormData ? options.body : JSON.stringify(options.body)) : undefined,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Ошибка запроса (${response.status})`);
  }

  return data;
}

function getOrCreateGlobalMessage() {
  let box = document.getElementById("globalMessage");
  if (box) return box;

  box = document.createElement("div");
  box.id = "globalMessage";
  box.className = "global-message";
  document.body.appendChild(box);
  return box;
}

function showMessage(text, isError = false) {
  const box = getOrCreateGlobalMessage();
  box.textContent = text;
  box.style.display = "block";
  box.style.background = isError ? "#8a2d2d" : "#2d2d2d";
  clearTimeout(showMessage.timeoutId);
  showMessage.timeoutId = setTimeout(() => {
    box.style.display = "none";
  }, 3500);
}

function formatPrice(value) {
  if (typeof value !== "number") return "—";
  return `${new Intl.NumberFormat("ru-RU").format(value)} ₸`;
}

function setCartCounter(value) {
  document.querySelectorAll("[data-cart-count]").forEach((el) => {
    el.textContent = String(value);
  });
}

async function updateCartCounter() {
  if (!getToken()) {
    setCartCounter(0);
    return;
  }
  try {
    const cart = await apiFetch("/api/cart");
    setCartCounter(cart.totalItems || 0);
  } catch (_error) {
    setCartCounter(0);
  }
}

function ensureHeaderControls() {
  const navLists = document.querySelectorAll(".nav .nav-links");
  const hasToken = Boolean(getToken());

  navLists.forEach((list) => {
    let authLink = list.querySelector("[data-auth-link]");
    if (!authLink) {
      authLink = Array.from(list.querySelectorAll("a")).find((a) => {
        const href = (a.getAttribute("href") || "").toLowerCase();
        const text = (a.textContent || "").toLowerCase();
        return href.includes("account.html") || text.includes("кабинет") || text.includes("войти");
      });
      if (authLink) {
        authLink.dataset.authLink = "1";
      }
    }

    if (!authLink) {
      const li = document.createElement("li");
      authLink = document.createElement("a");
      authLink.dataset.authLink = "1";
      li.appendChild(authLink);
      list.appendChild(li);
    }

    if (hasToken) {
      authLink.textContent = "Личный кабинет";
      authLink.href = "account.html";
      authLink.onclick = null;
    } else {
      authLink.textContent = "Войти";
      authLink.href = "#";
      authLink.onclick = (e) => {
        e.preventDefault();
        openAuthModal("login");
      };
    }

    let cartLink = list.querySelector("[data-cart-link]");
    if (!cartLink) {
      const li = document.createElement("li");
      cartLink = document.createElement("a");
      cartLink.href = "cart.html";
      cartLink.dataset.cartLink = "1";
      cartLink.innerHTML = 'Корзина (<span data-cart-count>0</span>)';
      li.appendChild(cartLink);
      list.appendChild(li);
    }
  });
}

function ensureAuthModal() {
  if (document.getElementById("authModal")) return;

  const modal = document.createElement("div");
  modal.id = "authModal";
  modal.className = "auth-modal";
  modal.innerHTML = `
    <div class="auth-modal__backdrop" data-auth-close></div>
    <div class="auth-modal__card" role="dialog" aria-modal="true" aria-label="Вход и регистрация">
      <button class="auth-modal__close" type="button" data-auth-close>×</button>
      <div class="auth-modal__tabs">
        <button type="button" id="authTabLogin" class="is-active">Вход</button>
        <button type="button" id="authTabRegister">Регистрация</button>
      </div>
      <form id="modalLoginForm" class="auth-modal__form">
        <label>Email<input type="email" name="email" required></label>
        <label>Пароль<input type="password" name="password" required></label>
        <button type="submit" class="btn btn-dark">Войти</button>
      </form>
      <form id="modalRegisterForm" class="auth-modal__form" hidden>
        <label>Имя<input type="text" name="fullName" required></label>
        <label>Email<input type="email" name="email" required></label>
        <label>Пароль<input type="password" name="password" minlength="6" required></label>
        <label>
          Роль
          <select name="role">
            <option value="buyer">Покупатель</option>
            <option value="seller">Продавец</option>
          </select>
        </label>
        <button type="submit" class="btn btn-dark">Зарегистрироваться</button>
      </form>
    </div>
  `;
  document.body.appendChild(modal);

  const loginTab = modal.querySelector("#authTabLogin");
  const registerTab = modal.querySelector("#authTabRegister");
  const loginForm = modal.querySelector("#modalLoginForm");
  const registerForm = modal.querySelector("#modalRegisterForm");

  const switchTab = (tab) => {
    const loginActive = tab === "login";
    loginTab.classList.toggle("is-active", loginActive);
    registerTab.classList.toggle("is-active", !loginActive);
    loginForm.hidden = !loginActive;
    registerForm.hidden = loginActive;
  };

  loginTab.addEventListener("click", () => switchTab("login"));
  registerTab.addEventListener("click", () => switchTab("register"));

  modal.querySelectorAll("[data-auth-close]").forEach((el) => {
    el.addEventListener("click", () => modal.classList.remove("is-open"));
  });

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(loginForm);
    try {
      const data = await apiFetch("/api/auth/login", {
        method: "POST",
        body: {
          email: fd.get("email"),
          password: fd.get("password"),
        },
      });
      setToken(data.token);
      modal.classList.remove("is-open");
      loginForm.reset();
      ensureHeaderControls();
      await updateCartCounter();
      showMessage("Вход выполнен.");
    } catch (error) {
      showMessage(error.message, true);
    }
  });

  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(registerForm);
    try {
      const data = await apiFetch("/api/auth/register", {
        method: "POST",
        body: {
          fullName: fd.get("fullName"),
          email: fd.get("email"),
          password: fd.get("password"),
          role: fd.get("role"),
        },
      });
      setToken(data.token);
      modal.classList.remove("is-open");
      registerForm.reset();
      ensureHeaderControls();
      await updateCartCounter();
      showMessage("Регистрация выполнена.");
    } catch (error) {
      showMessage(error.message, true);
    }
  });

  modal.switchTab = switchTab;
}

function openAuthModal(initialTab = "login") {
  ensureAuthModal();
  const modal = document.getElementById("authModal");
  if (!modal) return;
  if (typeof modal.switchTab === "function") {
    modal.switchTab(initialTab);
  }
  modal.classList.add("is-open");
}

async function addToCart(productId) {
  try {
    return await apiFetch("/api/cart", {
      method: "POST",
      body: { productId, quantity: 1 },
    });
  } catch (error) {
    if (String(error.message || "").includes("404")) {
      return apiFetch("/api/cart/items", {
        method: "POST",
        body: { productId, quantity: 1 },
      });
    }
    throw error;
  }
}

async function placeOrder(payload) {
  try {
    return await apiFetch("/api/orders", {
      method: "POST",
      body: payload,
    });
  } catch (error) {
    if (String(error.message || "").includes("404")) {
      return apiFetch("/api/orders/checkout", {
        method: "POST",
        body: payload,
      });
    }
    throw error;
  }
}

function getCatalogContainer() {
  return document.querySelector(".catalog-grid") || document.getElementById("catalogList");
}

async function initCatalogPage() {
  const container = getCatalogContainer();
  if (!container) return;

  const messageEl = document.getElementById("catalogMessage");
  const filters = document.getElementById("catalogFilters");

  const setCatalogMessage = (text) => {
    if (messageEl) messageEl.textContent = text;
  };

  const loadProducts = async () => {
    try {
      setCatalogMessage("Загрузка товаров...");
      container.innerHTML = "";

      const params = new URLSearchParams();
      if (filters) {
        const fd = new FormData(filters);
        ["search", "category", "material", "size", "minPrice", "maxPrice", "sort"].forEach((key) => {
          const value = (fd.get(key) || "").toString().trim();
          if (value) params.set(key, value);
        });
      }
      params.set("limit", "40");

      const data = await apiFetch(`/api/products?${params.toString()}`);
      const products = data.data || [];

      if (!products.length) {
        setCatalogMessage("Товары не найдены.");
        return;
      }

      products.forEach((product) => {
        const card = document.createElement("article");
        card.className = "product-card";
        card.innerHTML = `
          <div class="product-image">
            <img src="${product.imageUrl || "images/placeholder.svg"}" alt="${product.name}">
          </div>
          <h3>${product.name}</h3>
          <p class="price">${formatPrice(Number(product.price))}</p>
          <p>${product.material || "Материал не указан"} · ${product.size || "Размер не указан"}</p>
        `;

        const actions = document.createElement("div");
        actions.className = "halo-inline-actions";
        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "btn btn-dark";
        addBtn.textContent = "В корзину";
        addBtn.addEventListener("click", async () => {
          if (!getToken()) {
            showMessage("Сначала войдите в аккаунт.", true);
            openAuthModal("login");
            return;
          }
          try {
            await addToCart(product.id);
            await updateCartCounter();
            showMessage("Товар добавлен в корзину.");
          } catch (error) {
            showMessage(error.message, true);
          }
        });
        actions.appendChild(addBtn);
        card.appendChild(actions);
        container.appendChild(card);
      });

      setCatalogMessage(`Найдено товаров: ${products.length}`);
    } catch (error) {
      setCatalogMessage("Не удалось загрузить каталог.");
      showMessage(error.message, true);
    }
  };

  if (filters) {
    filters.addEventListener("submit", async (e) => {
      e.preventDefault();
      await loadProducts();
    });
    const resetBtn = document.getElementById("filtersReset");
    if (resetBtn) {
      resetBtn.addEventListener("click", async () => {
        filters.reset();
        await loadProducts();
      });
    }
  }

  await loadProducts();
}

async function initCartPage() {
  const cartPage = document.getElementById("cartPage");
  if (!cartPage) return;

  const list = document.getElementById("cartItems");
  const total = document.getElementById("cartTotal");
  const form = document.getElementById("orderForm");
  const empty = document.getElementById("cartEmpty");

  const renderCart = async () => {
    if (!getToken()) {
      if (empty) empty.hidden = false;
      if (list) list.innerHTML = "";
      if (total) total.textContent = formatPrice(0);
      showMessage("Для работы с корзиной нужно войти.", true);
      return;
    }

    try {
      const cart = await apiFetch("/api/cart");
      if (list) list.innerHTML = "";
      if (total) total.textContent = formatPrice(Number(cart.totalAmount || 0));

      if (!cart.items || cart.items.length === 0) {
        if (empty) empty.hidden = false;
      } else {
        if (empty) empty.hidden = true;
        cart.items.forEach((item) => {
          const row = document.createElement("article");
          row.className = "halo-list-item";
          row.innerHTML = `
            <h4>${item.productName}</h4>
            <p>Количество: ${item.quantity}</p>
            <p>Цена: ${formatPrice(Number(item.price))}</p>
            <p>Сумма: ${formatPrice(Number(item.lineTotal))}</p>
          `;
          if (list) list.appendChild(row);
        });
      }

      await updateCartCounter();
    } catch (error) {
      showMessage(error.message, true);
    }
  };

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!getToken()) {
        showMessage("Сначала войдите в аккаунт.", true);
        openAuthModal("login");
        return;
      }

      const fd = new FormData(form);
      try {
        const order = await placeOrder({
          deliveryMethod: fd.get("deliveryMethod"),
          deliveryAddress: fd.get("deliveryAddress"),
          paymentMethod: fd.get("paymentMethod"),
        });
        showMessage(`Заказ #${order.order.id} успешно оформлен.`);
        form.reset();
        await renderCart();
      } catch (error) {
        showMessage(error.message, true);
      }
    });
  }

  await renderCart();
}

function initSimpleAuthState() {
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      clearToken();
      ensureHeaderControls();
      updateCartCounter();
      showMessage("Вы вышли из аккаунта.");
    });
  }
}

function initAccountForms() {
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(loginForm);
      try {
        const data = await apiFetch("/api/auth/login", {
          method: "POST",
          body: {
            email: fd.get("email"),
            password: fd.get("password"),
          },
        });
        setToken(data.token);
        loginForm.reset();
        ensureHeaderControls();
        await updateCartCounter();
        showMessage("Вход выполнен.");
      } catch (error) {
        showMessage(error.message, true);
      }
    });
  }

  const registerForm = document.getElementById("registerForm");
  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(registerForm);
      try {
        const data = await apiFetch("/api/auth/register", {
          method: "POST",
          body: {
            fullName: fd.get("fullName"),
            email: fd.get("email"),
            password: fd.get("password"),
            role: fd.get("role") || "buyer",
          },
        });
        setToken(data.token);
        registerForm.reset();
        ensureHeaderControls();
        await updateCartCounter();
        showMessage("Регистрация выполнена.");
      } catch (error) {
        showMessage(error.message, true);
      }
    });
  }
}

function attachHeroFade() {
  const heroBg = document.getElementById("heroBg");
  const header = document.querySelector(".header");
  if (!heroBg || !header) return;
  window.addEventListener(
    "scroll",
    () => {
      const opacity = 1 - window.scrollY / (header.offsetHeight * 0.4);
      heroBg.style.opacity = Math.max(0, Math.min(1, opacity));
    },
    { passive: true }
  );
}

document.addEventListener("DOMContentLoaded", async () => {
  ensureAuthModal();
  ensureHeaderControls();
  initSimpleAuthState();
  initAccountForms();
  attachHeroFade();
  await updateCartCounter();
  await initCatalogPage();
  await initCartPage();
});
