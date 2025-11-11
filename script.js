/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

/* Load product data from JSON file */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  // keep a reference to the currently shown products so click handlers
  // can look up product details by id later
  window.__lastDisplayedProducts = products;

  productsContainer.innerHTML = products
    .map(
      (product) => `
    <div class="product-card" data-id="${product.id}">
      <img src="${product.image}" alt="${product.name}">
      <div class="product-info">
        <h3>${product.name}</h3>
        <p>${product.brand}</p>
      </div>
    </div>
  `
    )
    .join("");

  // after rendering, attach click listeners so cards can be selected
  attachCardListeners();
  // ensure any previously-selected products are visually marked
  markSelectedCards();
}

/* Selection state: store selected product objects keyed by id */
const selectedProducts = new Map();
const selectedProductsList = document.getElementById("selectedProductsList");

// Persist selected products to localStorage so selections survive reloads
function saveSelectedProducts() {
  try {
    const arr = Array.from(selectedProducts.values());
    localStorage.setItem("selectedProducts", JSON.stringify(arr));
  } catch (err) {
    console.warn("Could not save selected products", err);
  }
}

function loadSelectedFromStorage() {
  try {
    const raw = localStorage.getItem("selectedProducts");
    if (!raw) {
      renderSelectedProducts();
      return;
    }
    const arr = JSON.parse(raw);
    selectedProducts.clear();
    arr.forEach((p) => selectedProducts.set(p.id, p));
    renderSelectedProducts();
    // mark cards if currently visible
    markSelectedCards();
  } catch (err) {
    console.warn("Could not load selected products", err);
    renderSelectedProducts();
  }
}

/* Conversation history (OpenAI message format). Start with a system message.
   This array will be appended with user and assistant messages so every
   request includes the full conversation. */
const conversationMessages = [
  {
    role: "system",
    content:
      "You are a helpful L'Oréal assistant that provides step-by-step routines and product guidance when asked. Keep answers concise and user-friendly. Keep conversations to those beauty-related topics and don't respond to unrelated questions.",
  },
];

// Create a single tooltip element used for hover descriptions
const productTooltip = document.createElement("div");
productTooltip.className = "product-tooltip";
document.body.appendChild(productTooltip);

function showTooltipForCard(product, cardElement) {
  if (!product) return;
  productTooltip.innerText = product.description || "No description";
  productTooltip.style.opacity = "0";
  productTooltip.style.display = "block";

  // ensure it's measured with content
  const rect = cardElement.getBoundingClientRect();
  const ttRect = productTooltip.getBoundingClientRect();

  // prefer above the card, otherwise place below
  const margin = 8;
  let top = window.scrollY + rect.top - ttRect.height - margin;
  let left = window.scrollX + rect.left + (rect.width - ttRect.width) / 2;

  if (top < window.scrollY + 8) {
    top = window.scrollY + rect.bottom + margin;
  }

  // clamp left to viewport
  const maxLeft = window.scrollX + window.innerWidth - ttRect.width - 8;
  const minLeft = window.scrollX + 8;
  if (left < minLeft) left = minLeft;
  if (left > maxLeft) left = maxLeft;

  productTooltip.style.top = `${Math.round(top)}px`;
  productTooltip.style.left = `${Math.round(left)}px`;
  // fade in
  requestAnimationFrame(() => {
    productTooltip.style.opacity = "1";
  });
}

function hideTooltip() {
  productTooltip.style.opacity = "0";
  // keep it in the DOM but hide after transition
  setTimeout(() => {
    if (productTooltip.style.opacity === "0")
      productTooltip.style.display = "none";
  }, 200);
}

function attachCardListeners() {
  const cards = productsContainer.querySelectorAll(".product-card");
  cards.forEach((card) => {
    // avoid attaching multiple listeners
    if (card.dataset.listenerAttached) return;
    card.dataset.listenerAttached = "true";

    card.addEventListener("click", () => {
      const id = Number(card.dataset.id);
      toggleSelect(id, card);
    });

    // show product description on hover
    card.addEventListener("mouseenter", () => {
      const id = Number(card.dataset.id);
      const products = window.__lastDisplayedProducts || [];
      const product = products.find((p) => p.id === id) || null;
      showTooltipForCard(product, card);
    });

    card.addEventListener("mouseleave", () => {
      hideTooltip();
    });
  });
}

function toggleSelect(productId, cardElement) {
  // find product data from lastDisplayedProducts or by re-loading
  const products = window.__lastDisplayedProducts || [];
  const product = products.find((p) => p.id === productId);
  if (!product) return;

  if (selectedProducts.has(productId)) {
    selectedProducts.delete(productId);
    cardElement.classList.remove("selected");
  } else {
    selectedProducts.set(productId, product);
    cardElement.classList.add("selected");
  }
  // persist and update the selected-products UI
  saveSelectedProducts();
  renderSelectedProducts();
}

function renderSelectedProducts() {
  if (selectedProducts.size === 0) {
    selectedProductsList.innerHTML = `<div class="placeholder-message">No products selected</div>`;
    return;
  }

  selectedProductsList.innerHTML = Array.from(selectedProducts.values())
    .map(
      (p) => `
    <div class="selected-chip" data-id="${p.id}">
      <span class="chip-label">${p.name} <small>(${p.brand})</small></span>
      <button class="chip-remove" aria-label="Remove ${p.name}" data-remove-id="${p.id}">&times;</button>
    </div>
  `
    )
    .join("");

  // attach remove handlers
  selectedProductsList.querySelectorAll(".chip-remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(btn.dataset.removeId);
      selectedProducts.delete(id);

      // also un-highlight any visible card with that id
      const card = productsContainer.querySelector(
        `.product-card[data-id="${id}"]`
      );
      if (card) card.classList.remove("selected");

      renderSelectedProducts();
      saveSelectedProducts();
      e.stopPropagation();
    });
  });
}

/* Filter and display products when category changes */
// show initial selected area state
loadSelectedFromStorage();

// mark any visible cards as selected if they were stored
function markSelectedCards() {
  selectedProducts.forEach((p, id) => {
    const card = productsContainer.querySelector(
      `.product-card[data-id="${id}"]`
    );
    if (card) card.classList.add("selected");
  });
}

// keep selection persistent across categories until user removes
categoryFilter.addEventListener("change", async (e) => {
  const products = await loadProducts();
  const selectedCategory = e.target.value;

  /* filter() creates a new array containing only products
     where the category matches what the user selected */
  const filteredProducts = products.filter(
    (product) => product.category === selectedCategory
  );

  displayProducts(filteredProducts);
});

/* Chat form submission handler - send messages to OpenAI and append responses */
const sendBtn = document.getElementById("sendBtn");

function appendChatMessage(role, text) {
  const wrapper = document.createElement("div");
  wrapper.className = `chat-message ${role}`;
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";
  bubble.textContent = text;
  wrapper.appendChild(bubble);
  chatWindow.appendChild(wrapper);
  // keep scroll at bottom
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// (old single-message sender removed) The function below sends the full
// conversationMessages array to OpenAI and returns the assistant reply.
// Send the full conversation (array of {role,content}) to OpenAI and return assistant text
async function sendMessageToOpenAI(messages) {
  const WORKER_URL = "https://gtx-loreal-2.japiotras.workers.dev/";

  const res = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Worker error: ${res.status} ${errText}`);
  }

  const data = await res.json();
  // Worker returns { content: "assistant reply" }
  return data.content;
}

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("userInput");
  const text = input.value.trim();
  if (!text) return;

  // append user's message to the chat window and to conversation history
  appendChatMessage("user", text);
  conversationMessages.push({ role: "user", content: text });
  input.value = "";

  // indicate sending state
  sendBtn.disabled = true;

  try {
    // add a temporary thinking bubble
    appendChatMessage("assistant", "...thinking...");

    // send the full conversation so the model remembers context
    const aiText = await sendMessageToOpenAI(conversationMessages);

    // replace the temporary thinking bubble with the real reply
    const msgs = chatWindow.querySelectorAll(".chat-message.assistant");
    if (msgs.length) {
      const last = msgs[msgs.length - 1];
      const bubble = last.querySelector(".chat-bubble");
      if (bubble) bubble.textContent = aiText;
    } else {
      appendChatMessage("assistant", aiText);
    }

    // save assistant reply to conversation history
    conversationMessages.push({ role: "assistant", content: aiText });
  } catch (err) {
    console.error(err);
    appendChatMessage("assistant", `Error: ${err.message}`);
  } finally {
    sendBtn.disabled = false;
  }
});

/* Generate Routine button: collect selected products and call OpenAI */
const generateBtn = document.getElementById("generateRoutine");

function getSelectedProductsArray() {
  return Array.from(selectedProducts.values()).map((p) => ({
    id: p.id,
    brand: p.brand,
    name: p.name,
    category: p.category,
    image: p.image,
    description: p.description,
  }));
}

generateBtn.addEventListener("click", async () => {
  const items = getSelectedProductsArray();
  if (items.length === 0) {
    appendChatMessage(
      "assistant",
      "Please select at least one product to generate a routine."
    );
    return;
  }

  // prepare the user instruction containing the selected products
  const userInstruction = `Here are the selected products as JSON. Generate a step-by-step routine using these products, include application order, timing (AM/PM), any compatibility notes or cautions, and a short explanation for each step. Respond in plain text.\n\nSELECTED_PRODUCTS_JSON:\n${JSON.stringify(
    items,
    null,
    2
  )}`;

  // add user instruction to conversation history
  conversationMessages.push({ role: "user", content: userInstruction });

  // show a short visible user message and a thinking assistant bubble
  appendChatMessage(
    "user",
    `Generate routine for ${items.length} selected product(s).`
  );
  appendChatMessage("assistant", "...thinking...");

  // button state
  generateBtn.disabled = true;
  generateBtn.textContent = "Generating…";

  try {
    const aiText = await sendMessageToOpenAI(conversationMessages);

    // replace last assistant thinking bubble
    const msgs = chatWindow.querySelectorAll(".chat-message.assistant");
    if (msgs.length) {
      const last = msgs[msgs.length - 1];
      const bubble = last.querySelector(".chat-bubble");
      if (bubble) bubble.textContent = aiText;
    } else {
      appendChatMessage("assistant", aiText);
    }

    // save assistant reply to conversation history
    conversationMessages.push({ role: "assistant", content: aiText });
  } catch (err) {
    console.error(err);
    appendChatMessage("assistant", `Error generating routine: ${err.message}`);
  } finally {
    generateBtn.disabled = false;
    generateBtn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Generate Routine`;
  }
});
