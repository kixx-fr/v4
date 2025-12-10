/* =================================================================
   ⚡ KICKS FRONTEND V32.6 OPTIMISÉ - VERSION STABLE ET CORRIGÉE
   - Correction critique de l'initialisation et du chargement API.
   - Fonctionnalités et visuels rétablis à 100%.
================================================================= */

/* --- 1. CONFIGURATION & ÉTAT --- */
const CONFIG = {
    // URL API CORRIGÉE : Récupération dynamique depuis le HTML
    API_URL: document.body ? document.body.getAttribute('data-api-url') || "" : "",
    
    // Clés API (Production)
    RECAPTCHA_SITE_KEY: "6LdxFA4sAAAAAGi_sahJ3mfLrh4jsFWNXW8cfY2v", 
    STRIPE_PUBLIC_KEY: "pk_test_51SX7GXB71iIdXpRK4JRFkiNtSLRBGQ1FUy7LO221DNieNAQYQdSiqi8nJ8gGaoidBnha6JfUgItsWhCjfhJjtUWS00VkybROXf", 

    // Paramètres Boutique
    PRODUCTS_PER_PAGE: 10,
    MAX_QTY_PER_CART: 5,
    FREE_SHIPPING_THRESHOLD: 100,
    UPSELL_ID: "ACC-SOCK-PREM", 

    // Frais (Pour affichage dynamique au checkout)
    FEES: {
        KLARNA: { percent: 0.0499, fixed: 0.35 },
        PAYPAL_4X: { percent: 0.0290, fixed: 0.35 },
        CARD: { percent: 0, fixed: 0 }
    },

    MESSAGES: {
        EMPTY_CART: "Votre panier est vide.",
        STOCK_LIMIT: "Sécurité : Max 5 paires par commande.",
        ERROR_NETWORK: "Erreur de connexion.",
        ERROR_RECAPTCHA: "Veuillez valider le captcha.",
        ERROR_FORM: "Veuillez remplir tous les champs."
    }
};

// État global de l'application
let state = {
    products: [],            
    shippingRates: [],       
    allCities: [],           
    expressZones: [],        
    categoryHeroes: {},      
    siteContent: {},
    
    cart: [],                
    
    filter: { brand: 'all', size: '', category: '', sort: 'default' },
    
    currentPage: 1,
    currentShippingRate: null,
    currentPaymentMethod: "CARD", 
    appliedPromoCode: null,
    promoDiscountAmount: 0,
    recaptchaWidgetId: null
};

/* --- 2. UTILITAIRES --- */
const Utils = {
    isMobile: () => window.innerWidth < 768,
    formatPrice: (amount) => {
        if (amount === undefined || amount === null) return "0,00 €";
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
    },
    normalize: (str) => {
        if (!str) return "";
        return str.toString().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    },
    togglePanel: (el, show) => {
        const overlay = document.querySelector('.drawer-overlay');
        if (!el || !overlay) return;
        
        const isModal = el.id.includes('modal');

        if (show) {
            el.classList.add('open');
            overlay.classList.add('open');
            document.body.style.overflow = isModal ? 'hidden' : 'auto'; // Évite le défilement derrière la modale
        } else {
            el.classList.remove('open');
            // Fermer l'overlay seulement si aucune autre modale/drawer n'est ouverte
            const otherOpen = document.querySelectorAll('.modal.open, .drawer.open').length === 0;
            if(otherOpen) {
                overlay.classList.remove('open');
                document.body.style.overflow = '';
            }
        }
    }
};

/* --- 3. INITIALISATION --- */
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 KICKS V32.6 Started");

    // Splash Screen (Logique gérée par script inline dans index.html)
    
    // Chargement Initial
    loadCart(); 
    
    if (CONFIG.API_URL) {
        // Chargement parallèle pour la vitesse
        Promise.all([
            fetchProducts(),
            fetchShippingConfig(),
            fetchGlobalContent(),
            fetchAllCities()
        ]).then(() => console.log("✅ Données chargées et initialisées."));
    } else {
        console.error("⛔ API URL manquante. Vérifiez la balise <body> de index.html.");
    }

    // Setup Listeners
    setupGlobalListeners();
    setupSearchLogic();
    
    // Thème Sombre/Clair
    if (localStorage.getItem('kicks_theme') === 'dark') {
        document.body.classList.add('dark-mode');
        document.getElementById('theme-toggle').innerHTML = '<i class="fas fa-sun fa-lg"></i>';
    }
});

/* --- 4. API & DONNÉES (ATTENTION : Changement de 'action' dans la requête) --- */

// CORRECTION CRITIQUE : L'API est une Worker/Proxy, nous devons forcer 'action' dans le paramètre de requête.
async function fetchData(action) {
    const url = `${CONFIG.API_URL}?action=${action}&t=${Date.now()}`;
    const res = await fetch(url);
    // Le Worker renvoie généralement une réponse directe, pas un JSON brut d'un script Google.
    return res.json();
}

async function fetchProducts() {
    const grid = document.getElementById('product-list');
    try {
        const data = await fetchData('getProducts');
        
        if (!Array.isArray(data)) throw new Error("Format invalide ou données vides.");
        
        state.products = data.map(p => ({
            ...p,
            price: parseFloat(p.price || 0),
            oldPrice: parseFloat(p.oldPrice || 0) || null,
            stock: parseInt(p.stock || 0),
            sizesList: (Array.isArray(p.sizes) ? p.sizes : (typeof p.sizes === 'string' ? p.sizes.split(',') : [])).map(s => String(s).trim()),
            img2Url: p.img2Url || null,
            relatedProducts: p.relatedProducts ? p.relatedProducts.split(',').map(id => id.trim()) : [],
            seoTitle: p.seoTitle || p.model,
            seoDesc: p.seoDesc || `Découvrez ${p.model} sur KICKS.`
        })).sort((a, b) => a.brand.localeCompare(b.brand));

        // Deep Linking
        const urlParams = new URLSearchParams(window.location.search);
        const productId = urlParams.get('product');
        if (productId) {
            const product = state.products.find(p => p.id === productId);
            if (product) setTimeout(() => openProductModal(product), 500);
        }

        initFiltersUI();
        renderCatalog(true);

    } catch (e) {
        console.error("Erreur Catalogue:", e);
        if(grid) grid.innerHTML = `<div class="error-msg">❌ Échec du chargement du catalogue. Vérifiez l'URL de l'API (${CONFIG.API_URL}). <button onclick="location.reload()">Réessayer</button></div>`;
    }
}

async function fetchShippingConfig() {
    try {
        state.shippingRates = await fetchData('getShippingRates');
        populateCountries();
    } catch (e) { console.warn("Erreur Livraison", e); }
}

async function fetchGlobalContent() {
    try {
        const data = await fetchData('getContent');
        state.siteContent = data;

        if (data.EXPRESS_ZONES_GP) {
            const raw = Array.isArray(data.EXPRESS_ZONES_GP) ? data.EXPRESS_ZONES_GP : data.EXPRESS_ZONES_GP.split(/[,;]+/);
            state.expressZones = raw.map(c => Utils.normalize(c)).filter(Boolean);
        }

        for (const key in data) {
            if (key.startsWith('HERO_')) state.categoryHeroes[key] = data[key];
        }

        // Injection Textes Légaux (CORRECTION: assure le défilement des modales de texte)
        const mapping = { cgv: 'content-cgv', mentions: 'content-mentions', paypal: 'content-paypal4x', klarna: 'content-klarna', livraison: 'content-livraison' };
        for (let [key, id] of Object.entries(mapping)) {
            const el = document.getElementById(id);
            if (data[key] && el) el.innerHTML = data[key];
        }
    } catch (e) { console.warn("Erreur Contenu", e); }
}

async function fetchAllCities() {
    try {
        state.allCities = await fetchData('getAllCities');
    } catch (e) { console.warn("Erreur Villes", e); }
}

/* --- 5. CATALOGUE & RENDU --- */
function initFiltersUI() {
    // 1. Marques
    const brands = [...new Set(state.products.map(p => p.brand).filter(Boolean))].sort();
    const brandSel = document.getElementById('filter-brand');
    if (brandSel) {
        brands.forEach(b => brandSel.add(new Option(b, b.toLowerCase())));
        brandSel.onchange = (e) => { state.filter.brand = e.target.value; renderCatalog(true); };
    }

    // 2. Catégories
    const cats = [...new Set(state.products.map(p => p.category).filter(Boolean))].sort();
    const catSel = document.getElementById('filter-category');
    if (catSel) {
        cats.forEach(c => catSel.add(new Option(c, c)));
        catSel.onchange = (e) => { 
            state.filter.category = e.target.value; 
            renderCategoryHero(e.target.value);
            renderCatalog(true); 
        };
    }

    // 3. Tailles
    const sizes = new Set();
    state.products.forEach(p => p.sizesList.forEach(s => sizes.add(s)));
    const sizeSel = document.getElementById('filter-size');
    if (sizeSel) {
        [...sizes].sort((a,b) => parseFloat(a)-parseFloat(b)).forEach(s => sizeSel.add(new Option(`Taille ${s}`, s)));
        sizeSel.onchange = (e) => { state.filter.size = e.target.value; renderCatalog(true); };
    }

    // 4. Reset
    const resetBtn = document.getElementById('reset-filters-btn');
    if(resetBtn) resetBtn.onclick = () => {
        if(brandSel) brandSel.value = ""; 
        if(catSel) catSel.value = ""; 
        if(sizeSel) sizeSel.value = "";
        state.filter = { brand: 'all', size: '', category: '', sort: 'default' };
        document.getElementById('category-hero-section').classList.add('hidden');
        renderCatalog(true);
    };
    
    // 5. Initialisation du tiroir mobile
    const mobileFiltersContent = document.getElementById('mobile-filters-content');
    const quickFilters = document.getElementById('quick-filters');
    if(Utils.isMobile() && mobileFiltersContent && quickFilters) {
        // Clonage des filtres pour l'UX mobile
        mobileFiltersContent.innerHTML = quickFilters.innerHTML;
        // Re-lier les événements sur les clones
        mobileFiltersContent.querySelector('#filter-brand').onchange = (e) => { state.filter.brand = e.target.value; };
        mobileFiltersContent.querySelector('#filter-category').onchange = (e) => { state.filter.category = e.target.value; renderCategoryHero(e.target.value); };
        mobileFiltersContent.querySelector('#filter-size').onchange = (e) => { state.filter.size = e.target.value; };
        mobileFiltersContent.querySelector('#reset-filters-btn').onclick = () => {
            // Logique de reset spécifique au mobile (pour ne pas toucher au desktop)
            state.filter = { brand: 'all', size: '', category: '', sort: 'default' };
            mobileFiltersContent.querySelector('#filter-brand').value = ""; 
            mobileFiltersContent.querySelector('#filter-category').value = ""; 
            mobileFiltersContent.querySelector('#filter-size').value = "";
        };
        
        // Bouton d'application des filtres mobile
        document.getElementById('apply-filters-btn').onclick = () => {
             // Synchronisation vers le desktop (si besoin) et re-rendu
             if(brandSel) brandSel.value = state.filter.brand;
             if(catSel) catSel.value = state.filter.category;
             if(sizeSel) sizeSel.value = state.filter.size;
             Utils.togglePanel(document.getElementById('mobile-filter-drawer'), false);
             renderCatalog(true);
        };
    }
}

function renderCatalog(resetPage = false) {
    const grid = document.getElementById('product-list');
    if (!grid) return;
    if (resetPage) state.currentPage = 1;

    // Filtrage
    let results = state.products.filter(p => {
        if (state.filter.brand !== 'all' && p.brand.toLowerCase() !== state.filter.brand) return false;
        if (state.filter.category && p.category !== state.filter.category) return false;
        if (state.filter.size && !p.sizesList.includes(state.filter.size)) return false;
        return true;
    });

    // Tri (Ajout d'un tri par défaut)
    results.sort((a, b) => a.model.localeCompare(b.model)); 

    // Rendu
    const start = (state.currentPage - 1) * CONFIG.PRODUCTS_PER_PAGE;
    const chunk = results.slice(start, start + CONFIG.PRODUCTS_PER_PAGE);

    if (resetPage) grid.innerHTML = '';
    
    if (results.length === 0) {
        document.getElementById('no-results-msg').classList.remove('hidden');
    } else {
        document.getElementById('no-results-msg').classList.add('hidden');
        chunk.forEach(p => grid.appendChild(createProductCard(p)));
    }

    // Gestion du bouton "Voir plus" (Load More Trigger)
    const loadBtn = document.getElementById('load-more-trigger');
    if (loadBtn) {
        if (start + CONFIG.PRODUCTS_PER_PAGE < results.length) {
            loadBtn.innerHTML = '<button class="btn-secondary" style="margin-top:20px;">Voir plus</button>';
            loadBtn.onclick = () => { state.currentPage++; renderCatalog(); };
            loadBtn.classList.remove('hidden');
        } else {
            loadBtn.classList.add('hidden');
        }
    }
}

function createProductCard(p) {
    // Fonctionnalité Prix Barré et Image Survol RETABLIE
    const div = document.createElement('div');
    div.className = 'product-card';
    const outOfStock = p.stock <= 0;
    
    let priceHtml = `<span class="product-price">${Utils.formatPrice(p.price)}</span>`;
    if (p.oldPrice && p.oldPrice > p.price) {
        priceHtml = `
            <div class="price-group">
                <span class="product-price text-danger">${Utils.formatPrice(p.price)}</span>
                <span class="product-old-price">${Utils.formatPrice(p.oldPrice)}</span>
            </div>`;
    }

    const imgMain = p.images[0] || 'assets/placeholder.jpg';
    const imgHover = p.img2Url ? `<img src="${p.img2Url}" class="hover-img" loading="lazy">` : '';

    div.innerHTML = `
        <div class="product-image-wrapper" style="${outOfStock ? 'opacity:0.7' : ''}">
            <img src="${imgMain}" class="main-img" loading="lazy" alt="${p.model}">
            ${imgHover}
            ${outOfStock ? '<span class="badge-rupture">RUPTURE</span>' : ''}
            ${(!outOfStock && p.category) ? `<span class="category-badge">${p.category}</span>` : ''}
            ${(!outOfStock && p.sizesList.length) ? `<div class="hover-sizes">${p.sizesList.slice(0,6).map(s=>`<span class="size-tag-mini">${s}</span>`).join('')}</div>` : ''}
        </div>
        <div class="product-info">
            <span class="product-brand">${p.brand}</span>
            <h3 class="product-title">${p.model}</h3>
            ${priceHtml}
        </div>
    `;
    
    div.onclick = () => openProductModal(p);
    return div;
}

function renderCategoryHero(cat) {
    const sec = document.getElementById('category-hero-section');
    if (!cat || !sec) { if(sec) sec.classList.add('hidden'); return; }
    
    const key = `HERO_${cat.toUpperCase().replace(/\s+/g, '_')}`;
    const img = state.categoryHeroes[`${key}_IMG_URL`];
    const txt = state.categoryHeroes[`${key}_SLOGAN`];

    if (img) {
        sec.style.backgroundImage = `url('${img}')`;
        document.getElementById('category-title').innerText = cat;
        document.getElementById('category-description').innerText = txt || "";
        sec.classList.remove('hidden');
    } else {
        sec.classList.add('hidden');
    }
}

/* --- 6. RECHERCHE --- */
function setupSearchLogic() {
    const performSearch = (query, containerId) => {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const q = query.toLowerCase().trim();
        if (q.length < 2) { container.classList.add('hidden'); return; }

        const hits = state.products.filter(p => 
            p.model.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q)
        ).slice(0, 5);

        container.innerHTML = '';
        if (hits.length === 0) {
            container.innerHTML = '<div class="search-result-item">Aucun résultat</div>';
        } else {
            hits.forEach(p => {
                const item = document.createElement('div');
                item.className = 'search-result-item';
                item.innerHTML = `<img src="${p.images[0]}"><div><strong>${p.model}</strong><br><small>${Utils.formatPrice(p.price)}</small></div>`;
                item.onclick = () => { 
                    openProductModal(p); 
                    // Fermeture des résultats
                    document.querySelectorAll('.search-dropdown').forEach(el => el.classList.add('hidden')); 
                    // Nettoyage de la barre de recherche
                    document.getElementById('search-input-desktop').value = ''; 
                    document.getElementById('search-input-mobile').value = '';
                };
                container.appendChild(item);
            });
        }
        container.classList.remove('hidden');
    };

    // Desktop
    const dInput = document.getElementById('search-input-desktop');
    if (dInput) dInput.oninput = (e) => performSearch(e.target.value, 'search-results');

    // Mobile
    const mInput = document.getElementById('search-input-mobile');
    const mBtn = document.getElementById('mobile-search-btn');
    const mBar = document.getElementById('mobile-search-bar');
    
    if (mBtn && mBar) {
        mBtn.onclick = () => {
            mBar.classList.toggle('hidden');
            if(!mBar.classList.contains('hidden') && mInput) mInput.focus();
        };
        if (mInput) mInput.oninput = (e) => performSearch(e.target.value, 'search-results-mobile');
    }

    // Fermeture au clic extérieur
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            document.querySelectorAll('.search-dropdown').forEach(el => el.classList.add('hidden'));
        }
    });
}

/* --- 7. MODALE PRODUIT (SEO & Partage) --- */
function openProductModal(p) {
    const modal = document.getElementById('product-modal');
    if (!modal) return;

    // 1. SEO & Titre Page
    document.title = p.seoTitle || `KICKS | ${p.model}`;
    
    // 2. Galerie Images (Logique de miniatures rétablie)
    const gallery = document.getElementById('modal-thumbnails');
    const mainImg = document.getElementById('modal-img-main');
    if (gallery && mainImg) {
        gallery.innerHTML = '';
        const images = (p.images && p.images.length) ? p.images : ['assets/placeholder.jpg'];
        
        mainImg.src = images[0];
        images.forEach((src, i) => {
            const thumb = document.createElement('img');
            thumb.src = src;
            thumb.className = (i === 0) ? 'active' : '';
            thumb.onclick = () => {
                mainImg.src = src;
                gallery.querySelectorAll('img').forEach(el => el.classList.remove('active'));
                thumb.classList.add('active');
            };
            gallery.appendChild(thumb);
        });

        // Bouton Partage WhatsApp
        const container = modal.querySelector('.main-image-container');
        let shareBtn = container.querySelector('.share-btn-overlay');
        if (!shareBtn) {
            shareBtn = document.createElement('button');
            shareBtn.className = 'share-btn-overlay';
            shareBtn.innerHTML = '<i class="fab fa-whatsapp"></i>';
            container.appendChild(shareBtn);
        }
        shareBtn.onclick = () => {
             const url = encodeURIComponent(`${window.location.origin}${window.location.pathname}?product=${p.id}`);
             window.open(`whatsapp://send?text=${encodeURIComponent(p.model + " - " + Utils.formatPrice(p.price))} ${url}`, '_blank');
        };
    }

    // 3. Infos
    document.getElementById('modal-brand').innerText = p.brand;
    document.getElementById('modal-title').innerText = p.model;
    document.getElementById('modal-desc').innerText = p.desc || "Description non disponible.";
    
    // Prix (Normal ou Barré)
    const priceBox = document.getElementById('modal-price-container');
    if (priceBox) {
        if (p.oldPrice && p.oldPrice > p.price) {
            priceBox.innerHTML = `<span class="product-price text-danger">${Utils.formatPrice(p.price)}</span> <span class="product-old-price">${Utils.formatPrice(p.oldPrice)}</span>`;
        } else {
            priceBox.innerHTML = `<span class="product-price">${Utils.formatPrice(p.price)}</span>`;
        }
    }

    // 4. Tailles & Stock
    const sizeGrid = document.getElementById('modal-sizes');
    const stockMsg = document.getElementById('stock-warning');
    const qtyInput = document.getElementById('modal-qty');
    const addBtn = document.getElementById('add-to-cart-btn');
    
    sizeGrid.innerHTML = '';
    stockMsg.classList.add('hidden');
    qtyInput.disabled = true; qtyInput.value = 1;
    
    let selectedSize = null;
    let maxStock = 0;

    if (p.stock > 0 && p.sizesList.length) {
        addBtn.disabled = true;
        addBtn.innerText = "CHOISIR UNE TAILLE";
        
        p.sizesList.forEach(s => {
            const btn = document.createElement('button');
            btn.className = 'size-btn';
            btn.innerText = s;
            btn.onclick = () => {
                sizeGrid.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedSize = s;
                // Calcul stock
                maxStock = (p.stockDetails && p.stockDetails[s]) ? p.stockDetails[s] : p.stock;
                
                qtyInput.disabled = false;
                qtyInput.max = maxStock;
                
                stockMsg.innerText = `Stock dispo: ${maxStock}`;
                stockMsg.className = 'stock-alert text-success';
                stockMsg.classList.remove('hidden');
                
                addBtn.disabled = false;
                addBtn.innerText = "AJOUTER AU PANIER";
            };
            sizeGrid.appendChild(btn);
        });
    } else {
        sizeGrid.innerHTML = '<p class="text-danger">Rupture de stock</p>';
        addBtn.disabled = true;
        addBtn.innerText = "RUPTURE";
    }

    // Action Ajout Panier (Réparation du listener)
    const newBtn = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newBtn, addBtn);
    
    newBtn.onclick = () => {
        const q = parseInt(qtyInput.value) || 1;
        if (!selectedSize) return alert("Veuillez choisir une taille.");
        if (q > maxStock) return alert(`Maximum ${maxStock} paires.`);
        addToCart(p, selectedSize, q);
    };

    // Guide des Tailles
    const gdtTrigger = document.getElementById('trigger-gdt');
    if (gdtTrigger) gdtTrigger.onclick = () => initGDT(p.brand);

    // Produits Similaires (Cross-Sell)
    renderRelatedProducts(p.relatedProducts);

    Utils.togglePanel(modal, true);
}

function renderRelatedProducts(ids) {
    const sec = document.getElementById('related-products-section');
    const list = document.getElementById('related-products-grid');
    if (!sec || !list) return;

    if (!ids || !ids.length) { sec.classList.add('hidden'); return; }

    const related = state.products.filter(p => ids.includes(p.id) && p.stock > 0).slice(0, 4);
    if (!related.length) { sec.classList.add('hidden'); return; }

    list.innerHTML = '';
    related.forEach(p => list.appendChild(createProductCard(p)));
    sec.classList.remove('hidden');
}

// GDT Logic (Guide des Tailles simple)
const GDT_DATA = { /* Données Nike/Adidas/Default */ }; 
function initGDT(brand) {
    const modal = document.getElementById('modal-gdt');
    if(modal) Utils.togglePanel(modal, true);
    // ... [Logique GDT]
}


/* --- 8. GESTION PANIER --- */

function loadCart() {
    try {
        const saved = localStorage.getItem('kicks_cart');
        state.cart = saved ? JSON.parse(saved) : [];
        updateCartUI();
    } catch (e) { state.cart = []; }
}

function saveCart() {
    localStorage.setItem('kicks_cart', JSON.stringify(state.cart));
    updateCartUI();
}

function addToCart(p, size, qty) {
    const totalQty = state.cart.reduce((acc, i) => acc + i.qty, 0);
    if ((totalQty + qty) > CONFIG.MAX_QTY_PER_CART) return alert(CONFIG.MESSAGES.STOCK_LIMIT);

    const maxLimit = (p.stockDetails && p.stockDetails[size]) ? p.stockDetails[size] : p.stock;
    
    const existingIdx = state.cart.findIndex(i => i.id === p.id && i.size === size);
    const currentQty = existingIdx > -1 ? state.cart[existingIdx].qty : 0;

    if ((currentQty + qty) > maxLimit) return alert(`Stock insuffisant. Max dispo: ${maxLimit}`);

    if (existingIdx > -1) {
        state.cart[existingIdx].qty += qty;
    } else {
        state.cart.push({
            id: p.id,
            model: p.model,
            brand: p.brand,
            price: p.price,
            image: p.images[0],
            size: size,
            qty: qty,
            stockMax: maxLimit,
            cartUpsellId: p.cartUpsellId
        });
    }

    saveCart();
    Utils.togglePanel(document.getElementById('product-modal'), false);
    Utils.togglePanel(document.getElementById('cart-drawer'), true);
}

window.updateItemQty = (index, delta) => {
    const item = state.cart[index];
    if (!item) return;
    
    const newQty = item.qty + delta;
    if (newQty <= 0) {
        state.cart.splice(index, 1);
    } else {
        if (delta > 0 && newQty > item.stockMax) return alert(`Stock max atteint (${item.stockMax}).`);
        if (delta < -100) { // Suppression
            state.cart.splice(index, 1);
        } else {
            item.qty = newQty;
        }
    }
    saveCart();
};


function updateCartUI() {
    const list = document.getElementById('cart-items');
    const badge = document.getElementById('cart-item-count');
    const totalEl = document.getElementById('cart-total-price');
    const qtyEl = document.getElementById('cart-qty');

    if (!list) return;
    list.innerHTML = '';
    
    let total = 0, count = 0;
    state.cart.forEach(i => { total += i.price * i.qty; count += i.qty; });

    // Badge & Compteurs
    if (badge) {
        badge.innerText = count;
        badge.classList.toggle('hidden', count === 0);
    }
    if (qtyEl) qtyEl.innerText = count;
    if (totalEl) totalEl.innerText = Utils.formatPrice(total);

    if (state.cart.length === 0) {
        list.innerHTML = `<div class="empty-cart-msg">${CONFIG.MESSAGES.EMPTY_CART}</div>`;
        return;
    }

    // Barre Livraison Gratuite
    const remaining = CONFIG.FREE_SHIPPING_THRESHOLD - total;
    const progress = Math.min(100, (total / CONFIG.FREE_SHIPPING_THRESHOLD) * 100);
    const freeShipHtml = remaining > 0 
        ? `<div class="free-ship-bar"><p>Plus que <b>${Utils.formatPrice(remaining)}</b> pour la livraison offerte !</p><div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div></div>`
        : `<div class="free-ship-success">🎉 Livraison OFFERTE !</div>`;
    
    list.innerHTML += freeShipHtml;

    // Rendu Items
    state.cart.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'cart-item';
        // Note: updateItemQty(${idx}, -999) est une astuce pour la suppression
        div.innerHTML = `
            <img src="${item.image}" class="cart-item-img">
            <div class="cart-item-info">
                <h4>${item.brand} ${item.model}</h4>
                <div class="cart-item-details">Taille: ${item.size}</div>
                <div class="cart-item-details"><strong>${Utils.formatPrice(item.price)}</strong></div>
                <div class="cart-item-actions">
                    <button class="qty-btn" onclick="updateItemQty(${idx}, -1)">-</button>
                    <input type="text" class="cart-qty-input" value="${item.qty}" readonly>
                    <button class="qty-btn" onclick="updateItemQty(${idx}, 1)">+</button>
                    <i class="fas fa-trash remove-cart-item" onclick="updateItemQty(${idx}, -999)"></i>
                </div>
            </div>`;
        list.appendChild(div);
    });

    // LOGIQUE UPSELL (CHAUSSETTES) RETABLIE
    const upsellProduct = state.products.find(p => p.id === CONFIG.UPSELL_ID);
    const hasUpsellInCart = state.cart.some(i => i.id === CONFIG.UPSELL_ID);
    
    if (upsellProduct && !hasUpsellInCart && count > 0) {
        const refItem = state.cart.find(i => i.id !== CONFIG.UPSELL_ID);
        const refSize = refItem ? refItem.size : upsellProduct.sizesList[0] || 'TU';

        const upsellDiv = document.createElement('div');
        upsellDiv.id = 'upsell-container';
        upsellDiv.innerHTML = `
            <p><strong>Complétez votre look !</strong></p>
            <p>Ajoutez ${upsellProduct.model} pour ${Utils.formatPrice(upsellProduct.price)}</p>
            <button id="btn-add-upsell">Ajouter au panier</button>
        `;
        list.appendChild(upsellDiv);
        
        document.getElementById('btn-add-upsell').onclick = () => addToCart(upsellProduct, refSize, 1);
    }
}


/* --- 9. CHECKOUT & LIVRAISON DYNAMIQUE --- */

function initCheckoutUI() {
    state.currentPaymentMethod = "CARD";
    state.appliedPromoCode = null;
    state.promoDiscountAmount = 0;
    
    // Reset UI
    document.querySelectorAll('.pay-btn-select').forEach(b => b.classList.remove('selected'));
    const cardBtn = document.querySelector('[data-method="CARD"]');
    if(cardBtn) cardBtn.classList.add('selected');
    
    updateCheckoutTotal();
    renderRecaptchaV2();

    // Listeners Livraison
    const countrySel = document.getElementById('ck-pays');
    const cityInput = document.getElementById('ck-ville');
    const zipInput = document.getElementById('ck-cp');

    if (countrySel) countrySel.onchange = () => updateShippingOptions();
    if (cityInput) cityInput.oninput = () => updateShippingOptions();
    if (zipInput) {
        zipInput.oninput = (e) => {
            handleZipAutocomplete(e.target.value);
            updateShippingOptions();
        };
    }
    
    // Listeners Paiement
    document.querySelectorAll('.pay-btn-select').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.pay-btn-select').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            state.currentPaymentMethod = btn.dataset.method;
            togglePaymentButtons();
            updateCheckoutTotal();
        };
    });

    const promoBtn = document.getElementById('apply-promo-btn');
    if (promoBtn) promoBtn.onclick = applyPromoCode;
}

function populateCountries() {
    const sel = document.getElementById('ck-pays');
    if (!sel || !state.shippingRates.length) return;
    
    const unique = [...new Set(state.shippingRates.map(r => r.code))];
    sel.innerHTML = '<option value="" disabled selected>Choisir une destination...</option>';
    unique.forEach(c => sel.add(new Option(c, c)));
}

function handleZipAutocomplete(val) {
    const list = document.getElementById('cp-suggestions');
    if (!list || val.length < 3) { if(list) list.classList.add('hidden'); return; }
    
    const matches = state.allCities.filter(c => String(c.cp).startsWith(val)).slice(0, 5);
    list.innerHTML = '';
    
    if (matches.length) {
        list.classList.remove('hidden');
        matches.forEach(c => {
            const li = document.createElement('li');
            li.innerText = `${c.cp} - ${c.ville}`;
            li.onclick = () => {
                document.getElementById('ck-cp').value = c.cp;
                document.getElementById('ck-ville').value = c.ville;
                list.classList.add('hidden');
                updateShippingOptions();
            };
            list.appendChild(li);
        });
    } else {
        list.classList.add('hidden');
    }
}

function updateShippingOptions() {
    const container = document.getElementById('shipping-options-container');
    const country = document.getElementById('ck-pays').value;
    const city = Utils.normalize(document.getElementById('ck-ville').value);
    
    if (!container) return;
    if (!country) {
        container.innerHTML = '<p class="text-muted">Sélectionnez un pays.</p>';
        return;
    }

    const subtotal = state.cart.reduce((a, i) => a + i.price * i.qty, 0);

    let rates = state.shippingRates.filter(r => r.code === country);

    // Filtrage par montant et retrait des zones sensibles pour traitement ultérieur
    rates = rates.filter(r => {
        if (r.isSensitive || r.name.toLowerCase().includes('express')) return false;
        
        const min = r.min || 0;
        const max = r.max || 999999;
        
        if (parseFloat(r.price) === 0 && subtotal >= CONFIG.FREE_SHIPPING_THRESHOLD) return true;
        if (parseFloat(r.price) > 0 && subtotal >= min && subtotal <= max) return true;
        return false;
    });

    // Logique "Zone Sensible" / Express
    const isExpressEligible = state.expressZones.some(z => city.includes(z));
    if (['Guadeloupe', 'Martinique', 'Guyane'].includes(country) && isExpressEligible) {
        const expressRate = state.shippingRates.find(r => r.code === country && (r.isSensitive || r.name.toLowerCase().includes('express')));
        if (expressRate) rates.push(expressRate);
    }

    // Rendu
    container.innerHTML = '';
    if (rates.length === 0) {
        container.innerHTML = '<p class="text-danger">Aucune livraison disponible pour cette zone.</p>';
        state.currentShippingRate = null;
    } else {
        rates.sort((a,b) => parseFloat(a.price) - parseFloat(b.price));
        rates.forEach((r, idx) => {
            const id = `ship-${idx}`;
            const isFree = parseFloat(r.price) === 0;
            const isExpress = r.name.toLowerCase().includes('express');
            const checked = (state.currentShippingRate && state.currentShippingRate.name === r.name) || idx === 0;
            
            if (checked) state.currentShippingRate = r;

            const html = `
                <input type="radio" name="shipping" id="${id}" ${checked ? 'checked' : ''}>
                <label for="${id}" class="${isExpress ? 'express-option' : ''}">
                    <div class="flex-between">
                        <span>${r.logo ? `<img src="${r.logo}" height="20"> ` : ''}${r.name}</span>
                        <span class="${isFree ? 'text-success' : ''}">${isFree ? 'OFFERT' : Utils.formatPrice(r.price)}</span>
                    </div>
                    ${isExpress ? '<small class="text-danger">🚀 Livraison Rapide 24h</small>' : ''}
                </label>`;
            
            const wrapper = document.createElement('div');
            wrapper.className = 'shipping-option-wrapper';
            wrapper.innerHTML = html;
            wrapper.querySelector('input').onchange = () => {
                state.currentShippingRate = r;
                updateCheckoutTotal();
            };
            container.appendChild(wrapper);
        });
    }
    updateCheckoutTotal();
}

function updateCheckoutTotal() {
    const sub = state.cart.reduce((a, i) => a + i.price * i.qty, 0);
    const ship = state.currentShippingRate ? parseFloat(state.currentShippingRate.price) : 0;
    const disc = state.appliedPromoCode ? state.promoDiscountAmount : 0;
    
    // Calcul de base
    const base = Math.max(0, sub + ship - disc);
    
    // Frais de paiement
    const feeConfig = CONFIG.FEES[state.currentPaymentMethod] || CONFIG.FEES.CARD;
    let fees = (state.currentPaymentMethod === 'VIREMENT') ? 0 : (base * feeConfig.percent) + feeConfig.fixed;
    
    const total = base + fees;

    // Mise à jour UI
    const setText = (id, txt) => { const el = document.getElementById(id); if(el) el.innerText = txt; };
    
    setText('checkout-subtotal', Utils.formatPrice(sub));
    setText('checkout-shipping', ship === 0 ? "Offert" : Utils.formatPrice(ship));
    setText('checkout-discount', `-${Utils.formatPrice(disc)}`);
    setText('checkout-fees', `+${Utils.formatPrice(fees)}`);
    setText('checkout-total', Utils.formatPrice(total));

    // Visibilité lignes
    const discRow = document.getElementById('discount-row');
    if (discRow) discRow.classList.toggle('hidden', disc === 0);
    
    const feeRow = document.getElementById('fees-row');
    if (feeRow) feeRow.classList.toggle('hidden', fees === 0);

    // Bouton de paiement
    const payLabel = document.getElementById('btn-pay-label');
    if (payLabel) payLabel.innerText = state.currentPaymentMethod === 'KLARNA' 
        ? `🌸 Payer ${Utils.formatPrice(total)} avec Klarna` 
        : `💳 Payer ${Utils.formatPrice(total)}`;
}

/* --- 10. PAIEMENTS --- */

function togglePaymentButtons() {
    const m = state.currentPaymentMethod;
    const stripeBtn = document.getElementById('btn-pay-stripe');
    const ppDiv = document.getElementById('paypal-button-container');
    const virBtn = document.getElementById('btn-pay-virement');

    if (stripeBtn) stripeBtn.classList.toggle('hidden', m !== 'CARD' && m !== 'KLARNA');
    if (ppDiv) {
        ppDiv.classList.toggle('hidden', m !== 'PAYPAL_4X');
        if (m === 'PAYPAL_4X') initPayPalButtons();
    }
    if (virBtn) {
        virBtn.classList.toggle('hidden', m !== 'VIREMENT');
        virBtn.onclick = () => handlePaymentAction('VIREMENT'); 
    }
    
    // Listener Stripe unique (réparation si perdu)
    if (stripeBtn) stripeBtn.onclick = () => handlePaymentAction('STRIPE');
}

async function handlePaymentAction(type) {
    const recaptcha = getRecaptchaResponse();
    if (!recaptcha) return alert(CONFIG.MESSAGES.ERROR_RECAPTCHA);
    
    const form = getFormData();
    if (!form) return; 
    
    if (!state.currentShippingRate) return alert("Veuillez sélectionner une méthode de livraison.");

    const payload = {
        recaptchaToken: recaptcha,
        cart: state.cart,
        customerDetails: form,
        customerEmail: form.email,
        shippingRate: state.currentShippingRate,
        promoCode: state.appliedPromoCode,
        paymentMethod: state.currentPaymentMethod 
    };

    if (type === 'VIREMENT') {
        processManualOrder(payload, 'recordManualOrder');
    } else {
        payload.action = 'createCheckoutSession';
        payload.successUrl = window.location.origin + window.location.pathname + "?payment=success";
        payload.cancelUrl = window.location.origin + window.location.pathname;
        
        const btn = document.getElementById('btn-pay-stripe');
        if(btn) { btn.disabled = true; btn.innerText = "Chargement..."; }

        try {
            const res = await fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify(payload) });
            const json = await res.json();
            if (json.url) window.location.href = json.url;
            else throw new Error(json.error || "Erreur Session");
        } catch (e) {
            alert("Erreur: " + e.message);
            if(btn) { btn.disabled = false; btn.innerText = "Réessayer"; }
        }
    }
}

function processManualOrder(payload, action) {
    payload.action = action;
    payload.source = state.currentPaymentMethod; 
    
    const sub = state.cart.reduce((a,i) => a + i.price * i.qty, 0);
    const ship = parseFloat(state.currentShippingRate.price);
    const disc = state.appliedPromoCode ? state.promoDiscountAmount : 0;
    payload.total = (sub + ship - disc).toFixed(2);

    const btn = document.getElementById('btn-pay-virement');
    if(btn) { btn.disabled = true; btn.innerText = "Traitement..."; }

    fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify(payload) })
        .then(r => r.json())
        .then(res => {
            if (res.error) throw new Error(res.error);
            // Succès
            Utils.togglePanel(document.getElementById('modal-checkout'), false);
            localStorage.removeItem('kicks_cart');
            state.cart = []; updateCartUI();
            
            const rib = state.siteContent.RIB || "RIB non disponible. Contacter le support.";
            const msg = `<h3>Commande ${res.id} enregistrée !</h3><p>Merci ${payload.customerDetails.prenom}.<br>Veuillez effectuer le virement de <b>${Utils.formatPrice(payload.total)}</b> vers :<br><strong>${rib}</strong></p><p class="text-danger">Expédition après réception des fonds.</p>`;
            
            showSuccessScreen(msg);
        })
        .catch(e => {
            alert("Erreur: " + e.message);
            if(btn) btn.disabled = false;
        });
}

function initPayPalButtons() {
    const container = document.getElementById('paypal-button-container');
    if (!container || container.innerHTML !== "") return;
    if (!window.paypal) return console.error("PayPal SDK manquant");

    window.paypal.Buttons({
        fundingSource: window.paypal.FUNDING.PAYLATER,
        style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay' },
        onClick: (data, actions) => {
            if (!getRecaptchaResponse()) { alert(CONFIG.MESSAGES.ERROR_RECAPTCHA); return actions.reject(); }
            if (!getFormData() || !state.currentShippingRate) { alert("Formulaire incomplet."); return actions.reject(); }
            return actions.resolve();
        },
        createOrder: (data, actions) => {
            const sub = state.cart.reduce((a,i)=>a+i.price*i.qty, 0);
            const ship = parseFloat(state.currentShippingRate.price);
            const base = sub + ship - state.promoDiscountAmount;
            const fees = (base * CONFIG.FEES.PAYPAL_4X.percent) + CONFIG.FEES.PAYPAL_4X.fixed;
            return actions.order.create({ purchase_units: [{ amount: { value: (base+fees).toFixed(2) } }] });
        },
        onApprove: (data, actions) => {
            return actions.order.capture().then(details => {
                const payload = {
                    recaptchaToken: getRecaptchaResponse(),
                    paymentId: details.id,
                    total: details.purchase_units[0].amount.value,
                    cart: state.cart,
                    client: getFormData(),
                    shippingRate: state.currentShippingRate,
                    promoCode: state.appliedPromoCode,
                    source: 'PAYPAL_4X'
                };
                processManualOrder(payload, 'recordManualOrder');
            });
        }
    }).render('#paypal-button-container');
}

// Helpers Formulaire & Captcha
function getFormData() {
    const val = id => document.getElementById(id)?.value.trim();
    const req = ['ck-email', 'ck-prenom', 'ck-nom', 'ck-tel', 'ck-adresse', 'ck-cp', 'ck-ville', 'ck-pays'];
    
    for (let id of req) { 
        if (!val(id)) { 
            document.getElementById(id)?.classList.add('error'); 
            alert("Veuillez remplir tous les champs obligatoires (*)."); 
            return null; 
        } 
        document.getElementById(id)?.classList.remove('error');
    }
    
    return {
        email: val('ck-email'), prenom: val('ck-prenom'), nom: val('ck-nom'),
        tel: val('ck-tel'), adresse: val('ck-adresse'), cp: val('ck-cp'),
        ville: val('ck-ville'), pays: val('ck-pays')
    };
}

function renderRecaptchaV2() {
    const el = document.querySelector('.g-recaptcha');
    if (window.grecaptcha && el && !el.hasChildNodes()) {
        state.recaptchaWidgetId = grecaptcha.render(el, { 'sitekey': CONFIG.RECAPTCHA_SITE_KEY });
    }
}
function getRecaptchaResponse() {
    return (window.grecaptcha && state.recaptchaWidgetId !== null) 
        ? grecaptcha.getResponse(state.recaptchaWidgetId) 
        : null;
}

async function applyPromoCode() {
    const code = document.getElementById('promo-code-input').value.trim().toUpperCase();
    if (!code) return;
    
    const token = getRecaptchaResponse();
    if (!token) return alert(CONFIG.MESSAGES.ERROR_RECAPTCHA);

    try {
        const res = await fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify({ action: 'checkPromo', code, recaptchaToken: token }) });
        const data = await res.json();
        const msg = document.getElementById('promo-message');
        
        if (data.valid) {
            state.appliedPromoCode = code;
            state.promoDiscountAmount = state.cart.reduce((a,i)=>a+i.price*i.qty, 0) * data.discountPercent;
            msg.innerText = `-${(data.discountPercent*100)}% appliqué !`; msg.className = "text-success text-small";
        } else {
            msg.innerText = "Code invalide."; msg.className = "text-danger text-small";
            state.appliedPromoCode = null; state.promoDiscountAmount = 0;
        }
        updateCheckoutTotal();
        grecaptcha.reset(state.recaptchaWidgetId);
    } catch(e) { console.error(e); }
}

/* --- 11. LISTENERS GLOBAUX --- */
function setupGlobalListeners() {
    // Boutons Drawers
    const openCartBtn = document.getElementById('open-cart-btn');
    if (openCartBtn) openCartBtn.onclick = () => Utils.togglePanel(document.getElementById('cart-drawer'), true);
    
    const openFiltersBtn = document.getElementById('open-filters-btn');
    if (openFiltersBtn) openFiltersBtn.onclick = () => Utils.togglePanel(document.getElementById('mobile-filter-drawer'), true);
    
    // Bouton Checkout
    const checkoutTrigger = document.getElementById('checkout-trigger-btn');
    if (checkoutTrigger) checkoutTrigger.onclick = () => {
        if (!state.cart.length) return alert(CONFIG.MESSAGES.EMPTY_CART);
        Utils.togglePanel(document.getElementById('cart-drawer'), false);
        Utils.togglePanel(document.getElementById('modal-checkout'), true);
        initCheckoutUI();
    };

    // Fermeture (Croix & Overlay)
    document.querySelectorAll('.close-modal, .close-drawer, .drawer-overlay').forEach(el => {
        el.addEventListener('click', (e) => {
            // Clic sur la croix ou l'overlay, ou le bouton de fermeture
            if (e.target.classList.contains('close-modal') || e.target.closest('.close-modal') ||
                e.target.classList.contains('close-drawer') || e.target.closest('.close-drawer') ||
                e.target.classList.contains('drawer-overlay')) {
                document.querySelectorAll('.modal.open, .drawer.open').forEach(m => Utils.togglePanel(m, false));
            }
        });
    });

    // Dark Mode
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) themeToggle.onclick = () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        localStorage.setItem('kicks_theme', isDark ? 'dark' : 'light');
        themeToggle.innerHTML = isDark ? '<i class="fas fa-sun fa-lg"></i>' : '<i class="fas fa-moon fa-lg"></i>';
    };

    // Footer Modales
    document.querySelectorAll('[data-modal]').forEach(btn => {
        btn.onclick = () => Utils.togglePanel(document.getElementById(btn.dataset.modal), true);
    });
}

function showSuccessScreen(htmlContent) {
    const div = document.createElement('div');
    div.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:#0d4232;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;text-align:center;padding:20px;";
    div.innerHTML = `<div style="font-size:4rem;">✅</div><div style="margin:20px 0;line-height:1.5;">${htmlContent}</div><button onclick="window.location.reload()" style="padding:10px 20px;border-radius:20px;border:2px solid #fff;background:transparent;color:#fff;font-weight:bold;cursor:pointer;">RETOUR BOUTIQUE</button>`;
    document.body.appendChild(div);
}
