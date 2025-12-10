/* =================================================================
   ⚡ KICKS FRONTEND V32.6 (CORRECTIONS VITALES & V45.0 INTÉGRATION)
   PARTIE 1 : CONFIGURATION, CATALOGUE & LOGIQUE MOBILE/SHARE
================================================================= */

/* --- 1. CONFIGURATION GLOBALE --- */
const CONFIG = {
    // URL de l'API (Backend Google Apps Script)
    API_URL: document.body ? document.body.getAttribute('data-api-url') || "" : "",
    
    // 🔑 CLÉ PUBLIQUE RECAPTCHA V2
    RECAPTCHA_SITE_KEY: "6LdxFA4sAAAAAGi_sahJ3mfLrh4jsFWNXW8cfY2v", 

    // 💳 CLÉ PUBLIQUE STRIPE (Vérifiez qu'elle est correcte)
    STRIPE_PUBLIC_KEY: "pk_test_51SX7GXB71iIdXpRK4JRFkiNtSLRBGQ1FUy7LO221DNieNAQYQdSiqi8nJ8gGaoidBnha6JfUgItsWhCjfhHjtUWS00VkybROXf", 

    PRODUCTS_PER_PAGE: 10,       // Pagination catalogue
    MAX_QTY_PER_CART: 5,         // Limite anti-revendeurs
    FREE_SHIPPING_THRESHOLD: 100, // Seuil livraison gratuite (sauf Express)

    // Frais de transaction (Pour calcul dynamique au checkout)
    FEES: {
        KLARNA: { percent: 0.0499, fixed: 0.35, label: "Frais Klarna" },
        PAYPAL_4X: { percent: 0.0290, fixed: 0.35, label: "Frais PayPal" },
        CARD: { percent: 0, fixed: 0, label: "Aucun frais" } // Stripe CB
    },

    // Messages utilisateur
    MESSAGES: {
        EMPTY_CART: "Votre panier est vide.",
        STOCK_LIMIT: "Sécurité : Max 5 paires par commande.",
        ERROR_NETWORK: "Erreur de connexion. Vérifiez votre réseau.",
        ERROR_RECAPTCHA: "Veuillez cocher la case 'Je ne suis pas un robot'.",
        ERROR_FORM: "Veuillez remplir tous les champs obligatoires."
    }
};

/* --- 2. ÉTAT DE L'APPLICATION (STATE) --- */
let state = {
    products: [],            
    shippingRates: [],       
    allCities: [],           
    expressZones: [],        
    categoryHeroes: {},      
    
    cart: [],                
    
    filterBrand: 'all',
    currentSizeFilter: '',
    currentCategoryFilter: '',
    currentSort: 'default', // <<<<<< NOUVEL ÉTAT DE TRI
    
    currentPage: 1,
    
    currentShippingRate: null,
    currentPaymentMethod: "CARD", 
    appliedPromoCode: null,
    promoDiscountAmount: 0,
    
    recaptchaWidgetId: null,
    siteContent: {}          
};

/* --- 3. UTILITAIRES FONDAMENTAUX --- */

function isMobileOrTablet() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 1024;
}

function formatPrice(amount) {
    if (amount === undefined || amount === null) return "0,00 €";
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
}

function openPanel(el) { 
    if (el) {
        el.classList.add('open');
        if (isMobileOrTablet()) {
            document.body.style.overflow = 'hidden'; 
        }
    }
}

function closePanel(el) { 
    if (el) {
        el.classList.remove('open');
        document.body.style.overflow = ''; 
    }
}

function normalizeString(str) {
    if (!str) return "";
    return str.toString()
        .toUpperCase()                               
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
        .replace(/-/g, " ")                            
        .replace(/'/g, " ")                            
        .replace(/\b(LE|LA|LES|SAINT|STE|ST|L)\b/g, "") 
        .replace(/\s+/g, " ")                          
        .trim();                                     
}

function populateCountries(countriesList) {
    const select = document.getElementById('ck-pays');
    if (!select) return;

    select.innerHTML = '<option value="" disabled selected>Choisir une destination...</option>';

    if (!countriesList || !Array.isArray(countriesList)) return;

    countriesList.forEach(country => {
        const option = document.createElement('option');
        option.value = country.code; 
        option.textContent = country.code; 
        select.appendChild(option);
    });
}

function showSuccessScreen(name, htmlContent) {
    const div = document.createElement('div');
    div.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;text-align:center;padding:20px; overflow-y:auto;";
    
    div.innerHTML = `
        <div style="font-size:4rem;">✅</div>
        <h2 style="margin:20px 0; font-family:'Oswald', sans-serif;">MERCI ${name.toUpperCase()}</h2>
        <div style="font-size:1.2rem; line-height:1.6;">${htmlContent}</div>
        <button onclick="window.location.href='/'" style="margin-top:40px;padding:12px 30px;border:2px solid white;background:none;color:white;border-radius:30px;cursor:pointer;font-weight:bold;transition:0.3s;text-transform:uppercase;">Retour Boutique</button>
    `;
    document.body.appendChild(div);
}

/* --- 4. GESTION RECAPTCHA V2 --- */
function renderRecaptchaV2() {
    const container = document.querySelector('.g-recaptcha');
    if (window.grecaptcha && container) {
        try {
            if (container.innerHTML.trim() === "") {
                container.style.transform = 'scale(0.8)';
                container.style.transformOrigin = '0 0';

                state.recaptchaWidgetId = grecaptcha.render(container, {
                    'sitekey': CONFIG.RECAPTCHA_SITE_KEY,
                    'theme': 'light'
                });
            } else {
                grecaptcha.reset();
            }
        } catch(e) { console.warn("Recaptcha render warning:", e); }
    }
}

function getRecaptchaResponse() {
    if (window.grecaptcha) {
        if (state.recaptchaWidgetId !== null) {
            return grecaptcha.getResponse(state.recaptchaWidgetId);
        }
        return grecaptcha.getResponse();
    }
    return null;
}

/* =================================================================
   PARTIE 2 : INITIALISATION & CHARGEMENT DONNÉES (MODE INSTANTANÉ)
================================================================= */

document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 KICKS Frontend V32.6 (Backend V45.0) Started");

    // Splash Screen
    const splash = document.getElementById('splash-screen');
    if (splash && sessionStorage.getItem('kicks_splash_seen') === 'true') {
        splash.style.display = 'none';
    }

    // Chargement Panier
    loadCart();
    
    // ⚡ CHARGEMENT PARALLÈLE
    if (CONFIG.API_URL) {
        Promise.all([
            fetchProducts(),       // 1. Catalogue
            fetchShippingConfig(), // 2. Tarifs & Pays
            fetchGlobalContent(),  // 3. Config Express & Bannières & Textes
            fetchAllCities()       // 4. Villes (Autocomplétion locale)
        ]).then(() => {
            console.log("✅ Données chargées.");
        }).catch(e => {
            console.error("Erreur de chargement des données initiales:", e);
        });
    } else {
        console.error("⛔ API URL manquante. Vérifiez l'attribut data-api-url.");
    }
    
    // Gestion Thème (Sombre/Clair)
    if (localStorage.getItem('kicks_theme') === 'dark') {
        document.body.classList.add('dark-mode');
        updateThemeIcons(true);
    } else {
        updateThemeIcons(false);
    }

    // Retour Paiement Succès
    if (new URLSearchParams(window.location.search).get('payment') === 'success') {
        localStorage.removeItem('kicks_cart');
        state.cart = [];
        updateCartUI();
        showSuccessScreen("!", "Votre commande a été validée avec succès.");
    }

    setupGlobalListeners();
    setupMobileFilters();
});

/* --- APPELS API --- */

async function fetchProducts() {
    const grid = document.getElementById('product-grid');
    try {
        const res = await fetch(`${CONFIG.API_URL}?action=getProducts&t=${Date.now()}`); 
        const data = await res.json();
        
        if (!Array.isArray(data)) throw new Error("Format produits invalide");
        
        state.products = data.map(p => {
            let cleanSizes = Array.isArray(p.sizes) ? p.sizes : [];
            
            return {
                ...p,
                price: parseFloat(p.price || 0),
                // NOUVEAU: Prix Barré (V45.0)
                oldPrice: parseFloat(p.oldPrice || 0) || null,
                stock: parseInt(p.stock || 0),
                stockDetails: p.stockDetails || {},
                category: p.category || "", 
                sizesList: cleanSizes.map(s => String(s).trim()).filter(Boolean),
                // NOUVEAU: 2ème image pour le survol (V45.0)
                img2Url: p.img2Url || null,
                // NOUVEAU: Produits liés (chaîne d'IDs) (V45.0)
                relatedProducts: p.relatedProducts ? p.relatedProducts.split(',').map(id => id.trim()).filter(id => id.length > 0) : [],
                // NOUVEAU: Données SEO (V45.0)
                seoTitle: p.seoTitle || p.model,
                seoDesc: p.seoDesc || "Découvrez le modèle " + p.model + " et sa collection."
            };
        }).sort((a, b) => a.brand.localeCompare(b.brand));

        // Gestion de l'ouverture de la modale via lien direct (partage WhatsApp)
        const urlParams = new URLSearchParams(window.location.search);
        const productId = urlParams.get('product');
        if (productId) {
            const product = state.products.find(p => p.id === productId);
            if (product) {
                setTimeout(() => openProductModal(product), 500); 
            }
        }

        generateFilters(); 
        renderCatalog(true); 
        initSearch();

    } catch (e) {
        console.error("Erreur Catalogue:", e);
        if(grid) grid.innerHTML = `<div style="grid-column:1/-1; text-align:center;padding:50px;color:red;">Erreur chargement catalogue: ${e.message}<br><button onclick="location.reload()">Réessayer</button></div>`;
    }
}

async function fetchShippingConfig() {
    try {
        const res = await fetch(`${CONFIG.API_URL}?action=getShippingRates`); 
        const data = await res.json();
        
        if (Array.isArray(data)) {
            state.shippingRates = data;
            
            const uniqueCountries = [];
            const seen = new Set();

            data.forEach(rate => {
                const val = rate.code; 
                if (val && !seen.has(val)) {
                    seen.add(val);
                    uniqueCountries.push({ code: val, name: val });
                }
            });
            populateCountries(uniqueCountries);
        }
    } catch (e) { console.warn("Erreur Livraison", e); }
}

async function fetchGlobalContent() {
    try {
        const res = await fetch(`${CONFIG.API_URL}?action=getContent`); 
        const data = await res.json();
        state.siteContent = data;

        // CONFIG EXPRESS
        if (data.EXPRESS_ZONES_GP) {
            let zones = [];
            if (Array.isArray(data.EXPRESS_ZONES_GP)) zones = data.EXPRESS_ZONES_GP;
            else if (typeof data.EXPRESS_ZONES_GP === 'string') zones = data.EXPRESS_ZONES_GP.split(/[,;]+/);
            
            state.expressZones = zones.map(city => normalizeString(city)).filter(Boolean);
            console.log("🚀 Zones Express :", state.expressZones.length);
        }

        // Bannières et Textes Légaux
        for (const key in data) {
            if (key.startsWith('HERO_')) state.categoryHeroes[key] = data[key];
        }
        
        const mapping = { cgv: 'content-cgv', mentions: 'content-mentions', paypal: 'content-paypal4x', klarna: 'content-klarna', livraison: 'content-livraison' };
        for (let [key, id] of Object.entries(mapping)) {
            if (data[key] && document.getElementById(id)) document.getElementById(id).innerHTML = data[key];
        }
    } catch (e) { console.warn("Erreur Contenu", e); }
}

async function fetchAllCities() {
    try {
        const res = await fetch(`${CONFIG.API_URL}?action=getAllCities`); 
        const data = await res.json();
        
        let cities = [];
        if (Array.isArray(data)) cities = data;

        if (cities.length > 0) {
            state.allCities = cities.map(c => ({
                cp: String(c.cp).trim(), 
                ville: String(c.ville).trim(),
                villeNorm: normalizeString(c.ville)
            })); 
            console.log("🏙️ Villes en mémoire :", state.allCities.length);
        }
    } catch (e) { console.warn("Erreur Villes", e); }
}

/* --- CATALOGUE & FILTRES --- */

function generateFilters() {
    const container = isMobileOrTablet() ? 
        document.getElementById('mobile-filters-content') : 
        document.getElementById('filters-bar');
    
    if (!container) return;
    
    // Si mobile, on vide le contenu pour tout réinsérer proprement (incluant le nouveau filtre de tri)
    if (isMobileOrTablet()) container.innerHTML = ''; 

    // MARQUE
    const brands = [...new Set(state.products.map(p => p.brand).filter(Boolean))].sort();
    const brandSelect = document.createElement('select');
    brandSelect.innerHTML = '<option value="all">Toutes les marques</option>';
    brands.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.toLowerCase(); opt.textContent = b;
        brandSelect.appendChild(opt);
    });
    brandSelect.onchange = (e) => { state.filterBrand = e.target.value; renderCatalog(true); };
    container.appendChild(brandSelect);

    // CATÉGORIE
    const categories = [...new Set(state.products.map(p => p.category).filter(Boolean))].sort();
    if (categories.length > 0) {
        const catSelect = document.createElement('select');
        catSelect.innerHTML = '<option value="">Toutes catégories</option>';
        categories.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c; opt.textContent = c;
            catSelect.appendChild(opt);
        });
        catSelect.onchange = (e) => { 
            state.currentCategoryFilter = e.target.value; 
            renderCatalog(true); 
            renderCategoryHero(e.target.value); 
        };
        container.appendChild(catSelect);
    }

    // TAILLE
    let allSizes = new Set();
    state.products.forEach(p => { if(p.sizesList) p.sizesList.forEach(s => allSizes.add(String(s).trim())); });
    const sortedSizes = Array.from(allSizes).sort((a, b) => parseFloat(a) - parseFloat(b));
    const sizeSelect = document.createElement('select');
    sizeSelect.innerHTML = '<option value="">Toutes tailles</option>';
    sortedSizes.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s; opt.textContent = `Taille ${s}`;
        sizeSelect.appendChild(opt);
    });
    sizeSelect.onchange = (e) => { state.currentSizeFilter = e.target.value; renderCatalog(true); };
    container.appendChild(sizeSelect);
    
    // <<<<<< NOUVEAU FILTRE DE TRI (PRIX/ALPHABÉTIQUE)
    const sortOptions = [
        { value: 'default', label: 'Ordre par défaut' },
        { value: 'price_asc', label: 'Prix croissant (Moins cher)' },
        { value: 'price_desc', label: 'Prix décroissant (Plus cher)' },
        { value: 'name_asc', label: 'Nom A-Z' },
        { value: 'name_desc', label: 'Nom Z-A' }
    ];
    const sortSelect = document.createElement('select');
    sortSelect.innerHTML = '<option value="" disabled>Trier par...</option>';
    sortSelect.className = 'sort-select';
    
    sortOptions.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.value; opt.textContent = s.label;
        if (s.value === state.currentSort) opt.selected = true;
        sortSelect.appendChild(opt);
    });
    sortSelect.onchange = (e) => { 
        state.currentSort = e.target.value; 
        renderCatalog(true); 
    };
    container.appendChild(sortSelect);
    // FIN NOUVEAU FILTRE DE TRI
}

// <<<<<< NOUVELLE FONCTION DE TRI
function applySorting(products) {
    switch(state.currentSort) {
        case 'price_asc':
            return products.sort((a, b) => a.price - b.price);
        case 'price_desc':
            return products.sort((a, b) => b.price - a.price);
        case 'name_asc':
            return products.sort((a, b) => a.model.localeCompare(b.model));
        case 'name_desc':
            return products.sort((a, b) => b.model.localeCompare(a.model));
        case 'default':
        default:
            // Revient au tri par marque (chargé initialement dans fetchProducts)
            return products.sort((a, b) => a.brand.localeCompare(b.brand));
    }
}
// FIN NOUVELLE FONCTION DE TRI


function renderCategoryHero(category) {
    const heroSection = document.getElementById('category-hero-section');
    if (!heroSection) return;

    const catKey = category ? category.toUpperCase().replace(/\s+/g, '_') : "";
    const imgKey = `HERO_${catKey}_IMG_URL`;
    const sloganKey = `HERO_${catKey}_SLOGAN`;
    
    const imgUrl = state.categoryHeroes[imgKey];
    const slogan = state.categoryHeroes[sloganKey];

    if (category && imgUrl) {
        heroSection.style.backgroundImage = `url('${imgUrl}')`;
        heroSection.style.display = 'flex';
        const contentBox = document.getElementById('category-hero-content');
        if (contentBox) {
            contentBox.innerHTML = `<h2>${category}</h2>${slogan ? `<p>${slogan}</p>` : ''}`;
        }
    } else {
        heroSection.style.display = 'none';
    }
}

function renderCatalog(resetPage = false) {
    const grid = document.getElementById('product-grid');
    if (!grid) return;

    if (resetPage) state.currentPage = 1;

    let filtered = state.products;
    if (state.filterBrand !== 'all') filtered = filtered.filter(p => p.brand && p.brand.toLowerCase() === state.filterBrand);
    if (state.currentSizeFilter) filtered = filtered.filter(p => p.sizesList && p.sizesList.includes(state.currentSizeFilter));
    if (state.currentCategoryFilter) filtered = filtered.filter(p => p.category === state.currentCategoryFilter);
    
    // <<<<<< APPLICATION DU TRI APRÈS FILTRAGE
    filtered = applySorting(filtered);
    // FIN APPLICATION DU TRI

    const countEl = document.getElementById('result-count');
    if (countEl) countEl.innerText = `${filtered.length} paires`;

    const itemsPerPage = CONFIG.PRODUCTS_PER_PAGE;
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    if (state.currentPage > totalPages) state.currentPage = 1;
    const startIndex = (state.currentPage - 1) * itemsPerPage;
    const toShow = filtered.slice(startIndex, startIndex + itemsPerPage);

    grid.innerHTML = '';
    if (toShow.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:60px; color:#888;">Aucun modèle trouvé.</div>';
    } else {
        toShow.forEach(product => grid.appendChild(createProductCard(product)));
    }

    renderPaginationControls(totalPages);
    const loader = document.querySelector('.load-trigger');
    if(loader) loader.style.display = 'none';
}

// 💥 MISE À JOUR CRITIQUE : Création de la Carte Produit (Prix Barré & Survol Image & Badge Rupture)
function createProductCard(product) {
    const div = document.createElement('div');
    div.className = 'product-card';
    const isOutOfStock = (product.stock || 0) <= 0;
    
    // NOUVEAU: Rétablissement du badge "RUPTURE" si stock épuisé
    const badge = isOutOfStock ? '<span style="position:absolute; top:10px; right:10px; background:black; color:white; padding:4px 8px; font-size:0.7rem; font-weight:bold; border-radius:4px; z-index:2;">RUPTURE</span>' : '';
    const catBadge = (!isOutOfStock && product.category) ? `<span class="category-badge">${product.category}</span>` : '';
    
    const imgUrl = (product.images && product.images.length > 0) ? product.images[0] : 'assets/placeholder.jpg';
    
    // NOUVEAU: Affichage Prix Barré
    let priceHtml;
    if (product.oldPrice && product.oldPrice > product.price) {
        priceHtml = `
            <div class="price-group">
                <span class="product-price" style="color:var(--error-color);">${formatPrice(product.price)}</span>
                <span class="product-old-price">${formatPrice(product.oldPrice)}</span>
            </div>
        `;
    } else {
        priceHtml = `<span class="product-price">${formatPrice(product.price)}</span>`;
    }

    let sizesHtml = '';
    if (!isOutOfStock && product.sizesList.length > 0) {
        sizesHtml = `<div class="hover-sizes">${product.sizesList.slice(0, 8).map(s => `<span class="size-tag-mini">${s}</span>`).join('')}</div>`;
    }

    div.innerHTML = `
        <div class="product-image-wrapper" style="${isOutOfStock ? 'opacity:0.6' : ''}">
            <img src="${imgUrl}" alt="${product.model}" loading="lazy" class="main-img">
            ${badge} ${catBadge} ${sizesHtml}
        </div>
        <div class="product-info">
            <span class="product-brand">${product.brand || 'KICKS'}</span>
            <h3 class="product-title">${product.model || ''}</h3>
            <div class="product-bottom" style="display:flex; justify-content:space-between; align-items:center; margin-top:5px;">
                ${priceHtml}
                <button class="add-btn-mini" ${isOutOfStock ? 'disabled' : ''}>+</button>
            </div>
        </div>
    `;
    
    div.addEventListener('click', () => openProductModal(product));
    
    const addBtn = div.querySelector('.add-btn-mini');
    if (addBtn) {
        addBtn.addEventListener('click', (ev) => { 
            ev.stopPropagation(); 
            openProductModal(product); 
        });
    }
    
    // NOUVEAU: Logique de Survol pour l'Image 2 (CSS gère l'animation)
    if (product.img2Url && !isOutOfStock) {
        const wrapper = div.querySelector('.product-image-wrapper');
        
        const hoverImg = document.createElement('img');
        hoverImg.src = product.img2Url;
        hoverImg.alt = `Survol ${product.model}`;
        hoverImg.className = 'hover-img'; 
        wrapper.appendChild(hoverImg);
    }

    return div;
}

function renderPaginationControls(totalPages) {
    let container = document.getElementById('pagination-container');
    if (!container) {
        container = document.createElement('div'); 
        container.id = 'pagination-container'; 
        container.className = 'pagination-controls';
        const grid = document.getElementById('product-grid');
        if(grid) grid.after(container);
    }
    container.innerHTML = '';
    if (totalPages <= 1) return;
    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.className = `page-btn ${i === state.currentPage ? 'active' : ''}`;
        btn.innerText = i;
        btn.onclick = () => {
            state.currentPage = i; 
            renderCatalog(false);
            document.querySelector('.catalog-section').scrollIntoView({ behavior: 'smooth' });
        };
        container.appendChild(btn);
    }
}

/* --- MODALE PRODUIT & GDT (MISE À JOUR) --- */
// 💥 MISE À JOUR CRITIQUE : openProductModal (Gestion SEO, Prix Barré, Produits Similaires)
function openProductModal(product) {
    const modal = document.getElementById('product-modal');
    if (!modal) return;
    
    // 1. GESTION SEO (Mise à jour des tags Title et Description)
    document.title = product.seoTitle;
    const metaTitle = document.getElementById('meta-title');
    if(metaTitle) metaTitle.innerText = product.seoTitle;
    
    const metaDesc = document.getElementById('meta-description');
    if (metaDesc) metaDesc.setAttribute('content', product.seoDesc);

    // 2. GALERIE & PARTAGE 
    const galleryContainer = modal.querySelector('.modal-gallery');
    if (galleryContainer) {
        galleryContainer.innerHTML = '';
        const images = (product.images && product.images.length) ? product.images : ['assets/placeholder.jpg'];
        
        const mainCont = document.createElement('div');
        mainCont.className = 'main-image-container';
        mainCont.style.cssText = "position:relative; overflow:hidden; border-radius:8px;";
        
        const mainImg = document.createElement('img');
        mainImg.id = 'modal-img-main'; mainImg.src = images[0];
        mainCont.appendChild(mainImg);
        
        // Zoom (PC Only)
        if (!isMobileOrTablet()) {
            mainCont.addEventListener('mousemove', (e) => {
                const rect = mainCont.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width) * 100;
                const y = ((e.clientY - rect.top) / rect.height) * 100;
                mainImg.style.transformOrigin = `${x}% ${y}%`;
                mainImg.style.transform = "scale(2)";
            });
            mainCont.addEventListener('mouseleave', () => { mainImg.style.transform = "scale(1)"; });
        }

        // Flèches navigation 
        if (images.length > 1) {
            let currentIdx = 0;
            const updateImg = () => {
                mainImg.src = images[currentIdx];
                document.querySelectorAll('.thumbnails-row img').forEach((t, i) => t.classList.toggle('active', i === currentIdx));
            };

            const createArrow = (dir) => {
                const btn = document.createElement('button');
                btn.innerHTML = dir === 'prev' ? '&#10094;' : '&#10095;';
                btn.style.cssText = `position:absolute; top:50%; ${dir==='prev'?'left:10px':'right:10px'}; transform:translateY(-50%); background:rgba(255,255,255,0.8); border:none; padding:10px; cursor:pointer; border-radius:50%; z-index:10; font-size:1.2rem;`;
                return btn;
            };

            const prev = createArrow('prev');
            prev.onclick = (e) => { e.stopPropagation(); currentIdx = (currentIdx - 1 + images.length) % images.length; updateImg(); };
            const next = createArrow('next');
            next.onclick = (e) => { e.stopPropagation(); currentIdx = (currentIdx + 1) % images.length; updateImg(); };

            mainCont.appendChild(prev);
            mainCont.appendChild(next);
        }

        const thumbs = document.createElement('div'); thumbs.className = 'thumbnails-row';
        galleryContainer.append(mainCont, thumbs);

        const showImage = (idx) => {
            mainImg.src = images[idx];
            thumbs.querySelectorAll('img').forEach((img, i) => img.classList.toggle('active', i === idx));
        };

        images.forEach((src, idx) => {
            const t = document.createElement('img'); t.src = src; t.onclick = () => showImage(idx);
            thumbs.appendChild(t);
        });
        showImage(0);

        // Bouton Partage Social
        const shareButton = document.createElement('button');
        shareButton.className = 'share-btn';
        shareButton.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>';
        shareButton.style.cssText = "position:absolute; top:15px; left:15px; z-index:10; background:rgba(255,255,255,0.7); border-radius:50%; width:40px; height:40px; display:flex; align-items:center; justify-content:center;";
        mainCont.appendChild(shareButton);
        
        // Logique WhatsApp
        shareButton.onclick = (e) => {
            e.stopPropagation();
            const productTitle = encodeURIComponent(`${product.brand} ${product.model} - ${formatPrice(product.price)} sur KICKS.`);
            const productLink = encodeURIComponent(window.location.origin + window.location.pathname + "?product=" + product.id); 
            const whatsappUrl = `whatsapp://send?text=${productTitle}%0A${productLink}`;
            window.open(whatsappUrl, '_blank');
        };
    }
    
    // 3. INFORMATIONS & PRIX (Gestion Prix Barré dans Modale)
    document.getElementById('modal-brand').innerText = product.brand;
    document.getElementById('modal-title').innerText = product.model;
    document.getElementById('modal-desc').innerText = product.desc || "";
    
    const priceContainerEl = document.getElementById('modal-price-container');
    const priceEl = document.getElementById('modal-price');
    if (priceContainerEl && priceEl) {
        if (product.oldPrice && product.oldPrice > product.price) {
            priceEl.innerHTML = `
                <span style="font-size:1.5rem; font-weight:700; color:var(--error-color); margin-right:15px;">${formatPrice(product.price)}</span>
                <span style="font-size:1.1rem; color:var(--text-muted); text-decoration:line-through;">${formatPrice(product.oldPrice)}</span>
            `;
        } else {
            priceEl.innerText = formatPrice(product.price);
            priceEl.style.color = 'var(--text-primary)';
        }
    }


    // 4. TAILLES & STOCK 
    const sizeBox = document.getElementById('modal-sizes');
    const stockWarn = document.getElementById('stock-warning');
    const qtyIn = document.getElementById('modal-qty');
    
    sizeBox.innerHTML = ''; 
    stockWarn.classList.add('hidden');
    qtyIn.value = 1; qtyIn.disabled = true;
    let selSize = null, maxStock = 0;

    if (product.sizesList.length > 0 && product.stock > 0) {
        product.sizesList.forEach(s => {
            const btn = document.createElement('button');
            btn.className = 'size-btn'; btn.innerText = s;
            btn.onclick = () => {
                sizeBox.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selSize = s;
                maxStock = (product.stockDetails && product.stockDetails[s]) ? parseInt(product.stockDetails[s]) : product.stock;
                qtyIn.disabled = false; qtyIn.max = maxStock; qtyIn.value = 1;
                stockWarn.innerText = `Stock dispo : ${maxStock}`;
                stockWarn.style.color = "#28a745"; stockWarn.classList.remove('hidden');
            };
            sizeBox.appendChild(btn);
        });
    } else {
        sizeBox.innerHTML = '<div style="color:red; font-weight:bold;">Rupture de stock</div>';
    }

    const addBtn = document.getElementById('add-to-cart-btn');
    const newBtn = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newBtn, addBtn);
    
    newBtn.onclick = () => {
        const q = parseInt(qtyIn.value) || 1;
        if (!selSize) { 
            stockWarn.innerText = "Veuillez choisir une taille.";
            stockWarn.style.color = "red"; stockWarn.classList.remove('hidden'); return;
        }
        if (q > maxStock) return alert(`Stock insuffisant (${maxStock} paires max).`);
        addToCart(product, selSize, q);
    };

    // Guide des Tailles
    const gdtBtn = document.getElementById('trigger-gdt');
    if(gdtBtn) gdtBtn.onclick = () => { initGDT(product.brand); };
    
    // 5. NOUVEAU: Produits Similaires (related_products)
    renderRelatedProducts(product.relatedProducts);


    openPanel(modal);
    // Correction de défilement manuel (même si le CSS est censé le gérer, c'est une bonne pratique)
    if(isMobileOrTablet()) {
        const modalContent = modal.querySelector('.modal-content');
        if(modalContent) modalContent.scrollTop = 0;
    }
}

// Fonction pour afficher les produits similaires dans la modale
function renderRelatedProducts(relatedIds) {
    const section = document.getElementById('related-products-section');
    const grid = document.getElementById('related-products-grid');

    if (!section || !grid) return;

    if (!relatedIds || relatedIds.length === 0) {
        section.classList.add('hidden');
        return;
    }
    
    grid.innerHTML = '';
    
    // Filtrer les produits existants dans le state et qui ont du stock
    const relatedProducts = state.products.filter(p => relatedIds.includes(p.id) && p.stock > 0).slice(0, 4);

    if (relatedProducts.length === 0) {
        section.classList.add('hidden');
        return;
    } 
    
    section.classList.remove('hidden');

    relatedProducts.forEach(product => {
        const card = createProductCard(product); 
        // Retirer l'écouteur du bouton mini "+"
        const miniBtn = card.querySelector('.add-btn-mini');
        if(miniBtn) miniBtn.remove();
        
        grid.appendChild(card);
    });
}


// --- GUIDE DES TAILLES (INCHANGÉ) ---
const GDT_DATA = {
    "Nike": { "men":[["35","22.5"],["36","23"],["37","23.5"],["38","24"],["39","24.5"],["40","25"],["41","25.5"],["42","26"],["43","26.5"],["44","27"],["45","27.5"],["46","28"],["47","28.5"],["48","29"],["49","29.5"],["50","30"]], "women":[["35.5","22"],["36","22.5"],["37.5","23.5"],["38","24"],["39","25"],["40","25.5"],["41","26.5"]], "kids":[["27.5","16.5"],["28","17"],["29.5","18"],["30","18.5"],["31","19"],["32","20"],["33.5","21"]] },
    "Adidas": { "men":[["39 1/3","24.2"],["40","24.6"],["40 2/3","25"],["41 1/3","25.5"],["42","25.9"],["42 2/3","26.3"],["43 1/3","26.7"],["44","27.1"]], "women":[["36","22.1"],["36 2/3","22.5"],["37 1/3","22.9"],["38","23.3"],["38 2/3","23.8"],["39 1/3","24.2"]], "kids":[["28","16.8"],["29","17.6"],["30","18.4"],["31","19.2"]] },
    "Default": { "men":[["35","25"],["41","26"],["42","26.5"],["43","27.5"],["44","28"],["45","29"]], "women":[["36","22.5"],["37","23.5"],["38","24"],["39","25"],["40","25.5"]], "kids":[["28","17"],["30","18"],["32","19.5"]] }
};

function initGDT(brandName) {
    let key = "Default";
    if (brandName) {
        const b = brandName.toLowerCase();
        if (b.includes('nike') || b.includes('jordan')) key = "Nike";
        else if (b.includes('adidas') || b.includes('yeezy')) key = "Adidas";
    }
    const modal = document.getElementById('modal-gdt'); 
    if(modal) openPanel(modal);
    
    const titleEl = document.getElementById('brandTitle');
    if (titleEl) titleEl.innerText = key === "Default" ? (brandName || "Guide") : key;
    
    const controls = document.getElementById('controls');
    const mainArea = document.getElementById('mainArea');
    if (!controls || !mainArea) return;

    controls.innerHTML = '';
    const tabs = [{ id: 'men', label: 'Homme', color: '#007bff' }, { id: 'women', label: 'Femme', color: '#e83e8c' }, { id: 'kids', label: 'Enfant', color: '#28a745' }];
    const renderTable = (cat) => {
        const data = (GDT_DATA[key] && GDT_DATA[key][cat]) ? GDT_DATA[key][cat] : GDT_DATA["Default"][cat];
        let html = `<div class="card"><h2 style="color:${tabs.find(t=>t.id===cat).color}">Tableau ${tabs.find(t=>t.id===cat).label}</h2><div class="table-wrap"><table class="table"><thead><tr><th>Taille EU</th><th>CM</th></tr></thead><tbody>`;
        (data || []).forEach(row => html += `<tr><td data-label="Taille">${row[0]}</td><td data-label="Longueur">${row[1]} cm</td></tr>`);
        html += `</tbody></table></div></div>`;
        mainArea.innerHTML = html;
        Array.from(controls.children).forEach(btn => btn.classList.toggle('active', btn.dataset.tab === cat));
    };
    tabs.forEach(t => {
        const btn = document.createElement('button'); btn.className = 'tab'; btn.innerText = t.label; btn.dataset.tab = t.id;
        btn.addEventListener('click', () => renderTable(t.id)); controls.appendChild(btn);
    });
    renderTable('men');
}

// --- GESTION PANIER (INCHANGÉE & SANS VENTE FORCÉE) ---
function loadCart() { try { const saved = localStorage.getItem('kicks_cart'); if (saved) state.cart = JSON.parse(saved); updateCartUI(); } catch (e) { state.cart = []; } }
function saveCart() { localStorage.setItem('kicks_cart', JSON.stringify(state.cart)); }

function addToCart(product, size, qty) {
    const totalItems = state.cart.reduce((acc, item) => acc + item.qty, 0);
    if ((totalItems + qty) > CONFIG.MAX_QTY_PER_CART) { alert(CONFIG.MESSAGES.STOCK_LIMIT); return; }
    
    const limit = (product.stockDetails && product.stockDetails[size]) ? parseInt(product.stockDetails[size]) : product.stock;
    const existing = state.cart.find(i => i.id === product.id && i.size === size);
    const currentQty = existing ? existing.qty : 0;
    
    if ((currentQty + qty) > limit) { alert(`Stock insuffisant. Il ne reste que ${limit} paires.`); return; }

    if (existing) existing.qty += qty;
    else state.cart.push({ 
        id: product.id, 
        model: product.model, 
        brand: product.brand, 
        price: product.price, 
        image: (product.images && product.images[0]) ? product.images[0] : 'assets/placeholder.jpg', 
        size: size, 
        qty: qty, 
        stockMax: limit 
    });
    saveCart(); updateCartUI();
    closePanel(document.getElementById('product-modal')); openPanel(document.getElementById('cart-drawer'));
}

function changeQty(index, delta) { const item = state.cart[index]; if (!item) return; const newQty = item.qty + delta; if (delta > 0 && newQty > item.stockMax) { alert(`Stock max atteint (${item.stockMax}).`); return; } if (newQty <= 0) { removeFromCart(index); return; } item.qty = newQty; saveCart(); updateCartUI(); }
function removeFromCart(index) { state.cart.splice(index, 1); saveCart(); updateCartUI(); }

function updateCartUI() {
    const list = document.getElementById('cart-items'); const badge = document.getElementById('cart-count'); const totalEl = document.getElementById('cart-total-price'); const qtyEl = document.getElementById('cart-qty');
    if (!list) return; list.innerHTML = ""; let total = 0; let count = 0;

    if (state.cart.length === 0) { 
        // Pas de suggestion de vente additionnelle ici, respect de la contrainte "Rien voir apparaître dedans"
        list.innerHTML = `<div style="text-align:center; padding:40px; color:#888;">${CONFIG.MESSAGES.EMPTY_CART}</div>`; 
        if(badge) badge.classList.add('hidden'); 
    } 
    else {
        const remaining = CONFIG.FREE_SHIPPING_THRESHOLD - state.cart.reduce((acc, i) => acc + i.price * i.qty, 0);
        let progressHtml = remaining > 0 ? `<div style="padding:10px; background:var(--bg-secondary); margin-bottom:15px; border-radius:4px; font-size:0.9rem; border:1px solid var(--border-color);">Plus que <b>${formatPrice(remaining)}</b> pour la livraison offerte !<div style="height:4px; background:#ddd; margin-top:5px; border-radius:2px;"><div style="width:${Math.min(100, ((CONFIG.FREE_SHIPPING_THRESHOLD - remaining) / CONFIG.FREE_SHIPPING_THRESHOLD) * 100)}%; height:100%; background:#00c853; border-radius:2px;"></div></div></div>` : `<div style="padding:10px; background:#e8f5e9; color:#2e7d32; margin-bottom:15px; border-radius:4px; font-weight:bold; text-align:center;">🎉 Livraison OFFERTE !</div>`;
        list.insertAdjacentHTML('beforeend', progressHtml);
        state.cart.forEach((item, idx) => { total += item.price * item.qty; count += item.qty; const div = document.createElement('div'); div.className = 'cart-item'; div.innerHTML = `<img src="${item.image}" style="width:60px; height:60px; object-fit:cover; border-radius:4px; background:#f4f4f4;"><div style="flex:1;"><div style="font-weight:600; font-size:0.9rem;">${item.brand} ${item.model}</div><div style="font-size:0.8rem; color:#666;">Taille: ${item.size}</div><div style="font-weight:700; margin-top:4px;">${formatPrice(item.price)}</div><div class="qty-control" style="display:flex; align-items:center; gap:10px; margin-top:5px;"><button onclick="changeQty(${idx}, -1)" class="qty-btn">-</button><span>${item.qty}</span><button onclick="changeQty(${idx}, 1)" class="qty-btn">+</button><button onclick="removeFromCart(${idx})" class="remove-btn">Retirer</button></div></div>`; list.appendChild(div); });
        if(badge) { badge.innerText = count; badge.classList.remove('hidden'); }
    }
    if(totalEl) totalEl.innerText = formatPrice(total); if(qtyEl) qtyEl.innerText = count;
}

// --- RECHERCHE (Ajustée pour Mobile) ---
function initSearch() {
    const input = document.getElementById('search-input'); 
    const resultsBox = document.getElementById('search-results'); 
    const searchBtn = document.getElementById('search-btn');
    
    if (!input || !resultsBox || !searchBtn) return;

    if (isMobileOrTablet()) {
        resultsBox.classList.add('hidden');
    }

    input.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim(); 
        if (q.length < 2) { 
            resultsBox.classList.add('hidden'); 
            return; 
        }
        const hits = state.products.filter(p => (p.model && p.model.toLowerCase().includes(q)) || (p.brand && p.brand.toLowerCase().includes(q))).slice(0, 5);
        resultsBox.innerHTML = '';
        if (hits.length === 0) resultsBox.innerHTML = '<div class="search-result-item">Aucun résultat</div>';
        else { 
            hits.forEach(p => { 
                const item = document.createElement('div'); 
                item.className = 'search-result-item'; 
                const img = (p.images && p.images[0]) ? p.images[0] : ''; 
                item.innerHTML = `<img src="${img}"><div><span style="font-weight:bold">${p.model}</span><br><small>${formatPrice(p.price)}</small></div>`; 
                item.addEventListener('click', () => { 
                    openProductModal(p); 
                    resultsBox.classList.add('hidden'); 
                    input.value = ''; 
                }); 
                resultsBox.appendChild(item); 
            }); 
        }
        resultsBox.classList.remove('hidden');
    });
    
    document.addEventListener('click', (e) => { 
        if (!input.contains(e.target) && !resultsBox.contains(e.target) && !searchBtn.contains(e.target)) {
            resultsBox.classList.add('hidden'); 
        }
    });

}

function updateThemeIcons(isDark) { const sun = document.querySelector('.icon-sun'); const moon = document.querySelector('.icon-moon'); if (sun && moon) { sun.classList.toggle('hidden', isDark); moon.classList.toggle('hidden', !isDark); moon.style.color = isDark ? "#ffffff" : "inherit"; } }

/* --- LOGIQUE MOBILE ET OFF-CANVAS --- */

function setupMobileFilters() {
    const isMobile = isMobileOrTablet();
    const filterBar = document.getElementById('filters-bar');
    const mobileContent = document.getElementById('mobile-filters-content');
    const mobileTrigger = document.getElementById('mobile-menu-trigger');
    const filterDrawer = document.getElementById('mobile-filter-drawer');
    const applyBtn = document.getElementById('apply-filters-btn');

    if (isMobile && filterBar && mobileContent && filterDrawer) {
        if (filterBar.children.length > 0) {
            const fragment = document.createDocumentFragment();
            while (filterBar.firstChild) {
                fragment.appendChild(filterBar.firstChild);
            }
            mobileContent.innerHTML = '';
            mobileContent.appendChild(fragment);
            filterBar.style.display = 'none';
        }

        if (mobileTrigger) {
            mobileTrigger.classList.remove('hidden');
            mobileTrigger.addEventListener('click', () => {
                openPanel(filterDrawer);
            });
        }
        
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                closePanel(filterDrawer);
                // Le tri et le filtre sont déjà appliqués via les event listeners "onchange" dans generateFilters.
                // On s'assure juste que le catalogue est rafraîchi (même si l'un des filtres a déjà dû le faire)
                renderCatalog(true); 
            });
        }

    } else if (!isMobile && filterBar) {
        filterBar.style.display = 'flex';
        const mobileTrigger = document.getElementById('mobile-menu-trigger');
        if (mobileTrigger) mobileTrigger.classList.add('hidden');
    }
}
/* =================================================================
   ⚡ KICKS FRONTEND V32.6 (CORRECTIONS VITALES & V45.0 INTÉGRATION)
   PARTIE 2/2 : CHECKOUT FINAL, LIVRAISON DYNAMIQUE & PAIEMENTS
================================================================= */

function setupGlobalListeners() {
    // Panier
    const cartTrig = document.getElementById('cart-trigger');
    if (cartTrig) cartTrig.addEventListener('click', () => openPanel(document.getElementById('cart-drawer')));

    // Fermeture (Overlay/Croix)
    document.addEventListener('click', (e) => {
        const el = e.target;
        // Correction critique: Cibler les classes de fermeture d'origine + overlay
        if (el.classList.contains('close-drawer') || el.classList.contains('drawer-overlay') || el.classList.contains('close-modal') || el.classList.contains('modal-overlay')) {
            const parent = el.closest('.modal') || el.closest('.drawer');
            if(parent) {
                closePanel(parent);
                // Réinitialiser le titre de la page au titre par défaut après fermeture d'une modale produit
                if (parent.id === 'product-modal') {
                    document.title = "KICKS | Sneakers Exclusives";
                    const metaDesc = document.getElementById('meta-description');
                    if (metaDesc) metaDesc.setAttribute('content', "KICKS - La référence sneakers exclusives. Livraison 48H authenticité garantie.");
                }
            }
        }
    });

    // Modales Footer (CGV, etc.)
    document.addEventListener('click', (e) => {
        // Cibler les boutons d'information du footer
        const btn = e.target.closest('button[data-modal]');
        if (btn) { 
            const targetModal = document.getElementById(btn.getAttribute('data-modal')); 
            if(targetModal) {
                openPanel(targetModal);
                if(isMobileOrTablet()) {
                    const content = targetModal.querySelector('.modal-content');
                    if(content) content.scrollTop = 0;
                }
            }
        }
    });

    // Dark Mode (Inchangé)
    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            const isDark = document.body.classList.contains('dark-mode');
            localStorage.setItem('kicks_theme', isDark ? 'dark' : 'light');
            updateThemeIcons(isDark);
        });
    }

    // Bouton "Valider la commande" (Ouvre le Checkout)
    const checkoutBtn = document.getElementById('checkout-trigger-btn');
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', () => {
            if (state.cart.length === 0) { alert(CONFIG.MESSAGES.EMPTY_CART); return; }
            closePanel(document.getElementById('cart-drawer'));
            initCheckoutUI(); 
            openPanel(document.getElementById('modal-checkout')); 
            // 🛡️ Lancement ReCaptcha V2
            setTimeout(renderRecaptchaV2, 500); 
            const checkoutModal = document.getElementById('modal-checkout');
            if (isMobileOrTablet() && checkoutModal) {
                checkoutModal.querySelector('.modal-content').scrollTop = 0;
            }
        });
    }
}


function initCheckoutUI() {
    state.currentPaymentMethod = "CARD";
    state.appliedPromoCode = null;
    state.promoDiscountAmount = 0;

    // Listeners Livraison
    const paysSelect = document.getElementById('ck-pays');
    if (paysSelect) {
        paysSelect.addEventListener('change', () => updateShippingOptions(paysSelect.value));
    }

    const villeInput = document.getElementById('ck-ville');
    const cpInput = document.getElementById('ck-cp');

    // Maintien de la logique d'écoute pour la mise à jour dynamique de la livraison
    if (villeInput) villeInput.addEventListener('input', updateExpressShipping);
    if (cpInput) cpInput.addEventListener('input', updateExpressShipping);
    
    // Listeners Paiement
    const methodBtns = document.querySelectorAll('.pay-btn-select');
    methodBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            methodBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            state.currentPaymentMethod = btn.getAttribute('data-method');
            initPaymentButtonsArea(); updateCheckoutTotal();
        });
    });

    const promoBtn = document.getElementById('apply-promo-btn');
    if(promoBtn) promoBtn.addEventListener('click', applyPromoCode);

    initPaymentButtonsArea();
    updateCheckoutTotal();
    initAutocomplete();
    initFormNavigation(); 
}

// ✅ NAVIGATION FORMULAIRE (TOUCHE ENTRÉE)
function initFormNavigation() {
    const form = document.getElementById('checkout-form');
    if (!form) return;
    
    const inputs = form.querySelectorAll('input, select');
    inputs.forEach((input, index) => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const nextInput = inputs[index + 1];
                if (nextInput) {
                    nextInput.focus();
                } else {
                    document.querySelector('.checkout-summary-col').scrollIntoView({ behavior: 'smooth' });
                }
            }
        });
    });
}

/// 💥 Autocomplétion (Code maintenu tel qu'il était dans la V32.5 analysée)
function initAutocomplete() {
    const cpInput = document.getElementById('ck-cp');
    const villeInput = document.getElementById('ck-ville');
    if (!cpInput || !villeInput) return;
    
    let suggestionsBox = document.getElementById('cp-suggestions');
    if (!suggestionsBox) { 
        console.error("Autocomplete: Élément #cp-suggestions manquant dans le HTML.");
        return;
    }
    suggestionsBox.style.display = 'none';
    
    // Écouteur d'Input (Code Postal)
    cpInput.addEventListener('input', (e) => {
        const cpVal = e.target.value.trim(); 
        
        // Déclenchement de la suggestion et de la recherche dynamique
        if (cpVal.length < 3 || state.allCities.length === 0) { 
             suggestionsBox.style.display = 'none'; 
             updateExpressShipping(); 
             return; 
        }

        // Recherche locale
        const matches = state.allCities.filter(c => String(c.cp).startsWith(cpVal)).slice(0, 8);
        
        suggestionsBox.innerHTML = '';
        if (matches.length > 0) {
            suggestionsBox.style.display = 'block';
            matches.forEach(c => {
                const li = document.createElement('li'); 
                li.innerText = `${c.cp} - ${c.ville}`;
                li.onclick = () => { 
                    cpInput.value = c.cp; 
                    villeInput.value = c.ville; 
                    suggestionsBox.style.display = 'none'; 
                    cpInput.dispatchEvent(new Event('input')); 
                };
                suggestionsBox.appendChild(li);
            });
        } else {
            suggestionsBox.style.display = 'none';
        }
    });

    // Fermeture au clic extérieur
    document.addEventListener('click', (e) => { 
        if (e.target !== cpInput && !suggestionsBox.contains(e.target)) {
            suggestionsBox.style.display = 'none'; 
        }
    });
}

/* --- LOGIQUE LIVRAISON DYNAMIQUE (EXPRESS INTELLIGENT) --- */

function updateExpressShipping() {
    const paysSelect = document.getElementById('ck-pays');
    const selectedZone = paysSelect ? paysSelect.value : null;
    
    if(selectedZone) {
         updateShippingOptions(selectedZone);
    } else {
        const container = document.getElementById('shipping-options-container');
        if (container) container.innerHTML = '<div style="color:#666; font-style:italic; padding:10px;">Veuillez choisir votre pays de livraison.</div>';
        state.currentShippingRate = null;
        updateCheckoutTotal();
    }
}

function updateShippingOptions(selectedZone) {
    const container = document.getElementById('shipping-options-container');
    if (!container) return;
    container.innerHTML = '';

    const villeInput = document.getElementById('ck-ville');
    const cpInput = document.getElementById('ck-cp');
    
    if (!villeInput || !cpInput || villeInput.value.trim().length < 3) {
        container.innerHTML = '<div style="color:#666; font-style:italic; padding:10px;">Veuillez compléter votre adresse (CP et Ville) pour voir les tarifs.</div>';
        state.currentShippingRate = null;
        updateCheckoutTotal();
        return;
    }

    const cartSubtotal = state.cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
    
    const userCityRaw = villeInput.value;
    const userCityNorm = normalizeString(userCityRaw);

    // 1. Filtrage STANDARD (Colissimo, Gratuit ou Payant)
    let validRates = state.shippingRates.filter(rate => {
        if (rate.code !== selectedZone) return false;
        if (String(rate.name).toLowerCase().includes('express') || rate.isSensitive) return false; 

        const min = parseFloat(rate.min || 0);
        const max = parseFloat(rate.max || 999999);
        
        const isFreeShippingRate = parseFloat(rate.price) === 0;
        if (cartSubtotal >= CONFIG.FREE_SHIPPING_THRESHOLD && isFreeShippingRate) {
            return true;
        }
        
        if (!isFreeShippingRate) {
            return cartSubtotal >= min && cartSubtotal <= max;
        }
        
        return false;
    });

    // 2. LOGIQUE EXPRESS DYNAMIQUE (Zone Antilles/Guyane)
    if (selectedZone === 'Guadeloupe' || selectedZone === 'Martinique' || selectedZone === 'Guyane') {
        const isEligible = state.expressZones.some(zoneKeyword => userCityNorm.includes(zoneKeyword));
        
        if (isEligible) {
            const expressRate = state.shippingRates.find(r => 
                r.code === selectedZone && 
                (String(r.name).toLowerCase().includes('express') || r.isSensitive)
            );
            
            if (expressRate) {
                const min = parseFloat(expressRate.min || 0);
                const max = parseFloat(expressRate.max || 999999);
                if (cartSubtotal >= min && cartSubtotal <= max) {
                    validRates.push(expressRate);
                }
            }
        }
    }

    // 3. Affichage des Options
    if (validRates.length === 0) {
        container.innerHTML = '<div style="color:red; padding:10px;">Aucune livraison disponible pour cette zone/montant.</div>';
        state.currentShippingRate = null;
    } else {
        validRates.sort((a, b) => (parseFloat(a.price)||0) - (parseFloat(b.price)||0));

        validRates.forEach((rate, idx) => {
            const label = document.createElement('label');
            const logoHtml = rate.logo ? `<img src="${rate.logo}" style="height:25px; margin-right:10px; object-fit:contain;">` : '';
            const price = parseFloat(rate.price || 0);
            const priceTxt = price === 0 ? "OFFERT" : formatPrice(price);
            const color = price === 0 ? "#00c853" : "#000";
            
            const isExpress = String(rate.name).toLowerCase().includes('express') || rate.isSensitive;
            const bgStyle = isExpress ? "background:#fff8e1; border:1px solid #ffc107;" : "";
            
            const isSelected = (!state.currentShippingRate && idx === 0) || (state.currentShippingRate && state.currentShippingRate.name === rate.name && state.currentShippingRate.code === rate.code);

            label.innerHTML = `
                <div class="shipping-option" style="display:flex; align-items:center; width:100%; cursor:pointer; padding:10px; border-radius:6px; ${bgStyle}">
                    <input type="radio" name="shipping_method" value="${idx}" ${isSelected?'checked':''} style="margin-right:15px;">
                    ${logoHtml}
                    <div style="flex:1;">
                        <span style="font-weight:700;">${rate.name}</span>
                        ${isExpress ? '<br><small style="color:#d32f2f; font-weight:bold;">🚀 Livraison Rapide 24h</small>' : ''}
                    </div>
                    <b style="color:${color}">${priceTxt}</b>
                </div>
            `;
            
            label.querySelector('input').addEventListener('change', () => { 
                state.currentShippingRate = rate; 
                updateCheckoutTotal(); 
            });
            container.appendChild(label);
            
            if(isSelected || (!state.currentShippingRate && idx === 0)) state.currentShippingRate = rate;
        });
    }
    updateCheckoutTotal();
}

// 💥 Calcul Total avec Frais Dynamiques
function updateCheckoutTotal() {
    const subTotal = state.cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
    const shipping = state.currentShippingRate ? parseFloat(state.currentShippingRate.price) : 0;
    const discount = state.appliedPromoCode ? state.promoDiscountAmount : 0;
    const baseTotal = Math.max(0, subTotal + shipping - discount);
    
    const feeConfig = CONFIG.FEES[state.currentPaymentMethod] || CONFIG.FEES.CARD;
    let fees = 0;
    
    if (state.currentPaymentMethod !== 'CARD' && state.currentPaymentMethod !== 'VIREMENT') {
        fees = (baseTotal * feeConfig.percent) + feeConfig.fixed;
    }
    
    fees = Math.max(0, fees);
    const grandTotal = baseTotal + fees;

    const setText = (id, val) => { const el = document.getElementById(id); if(el) el.innerText = val; };
    setText('checkout-subtotal', formatPrice(subTotal));
    setText('checkout-shipping', state.currentShippingRate ? (shipping===0?"Offert":formatPrice(shipping)) : "...");
    
    const discRow = document.getElementById('discount-row');
    if (discRow) {
        if(discount > 0) { discRow.classList.remove('hidden'); setText('checkout-discount', "- " + formatPrice(discount)); } 
        else discRow.classList.add('hidden');
    }

    const feesRow = document.getElementById('fees-row');
    const feesEl = document.getElementById('checkout-fees');
    if (feesRow && feesEl) {
        if (fees > 0) { 
            feesRow.style.display = 'flex'; 
            feesRow.classList.remove('hidden');
            feesEl.innerText = "+ " + formatPrice(fees); 
        }
        else {
            feesRow.style.display = 'none';
            feesRow.classList.add('hidden');
        }
    }

    setText('checkout-total', formatPrice(grandTotal));
    
    const payLabel = document.getElementById('btn-pay-label');
    if (payLabel) {
        if (state.currentPaymentMethod === 'KLARNA') payLabel.innerText = `🌸 Payer ${formatPrice(grandTotal)}`;
        else if (state.currentPaymentMethod === 'CARD') payLabel.innerText = `💳 Payer ${formatPrice(grandTotal)}`;
    }
}

/* --- BOUTONS DE PAIEMENT & HELPERS --- */

function initPaymentButtonsArea() {
    let btnVirement = document.getElementById('btn-pay-virement');
    const payActions = document.querySelector('.payment-actions');
    
    if (!btnVirement && payActions) {
        btnVirement = document.createElement('button');
        btnVirement.id = 'btn-pay-virement'; btnVirement.className = 'btn-primary full-width hidden';
        btnVirement.innerText = "💶 Confirmer le Virement";
        btnVirement.onclick = initiateBankTransfer;
        payActions.appendChild(btnVirement);
    }

    const stripeBtn = document.getElementById('btn-pay-stripe');
    const paypalDiv = document.getElementById('paypal-button-container');
    const method = state.currentPaymentMethod;

    if(stripeBtn) {
        stripeBtn.classList.add('hidden');
        const newBtn = stripeBtn.cloneNode(true);
        stripeBtn.parentNode.replaceChild(newBtn, stripeBtn);
        newBtn.addEventListener('click', handleStripePayment);
    }
    
    if(paypalDiv) paypalDiv.classList.add('hidden');
    if(btnVirement) btnVirement.classList.add('hidden');

    if (method === 'VIREMENT') {
        if(btnVirement) btnVirement.classList.remove('hidden');
    } else if (method === 'PAYPAL_4X') {
        if(paypalDiv) { paypalDiv.classList.remove('hidden'); initPayPalButtons(); }
    } else {
        const sBtn = document.getElementById('btn-pay-stripe');
        if(sBtn) sBtn.classList.remove('hidden');
    }
}

// A. VIREMENT (Backend: recordManualOrder)
function initiateBankTransfer() {
    const recaptchaToken = getRecaptchaResponse();
    if (!recaptchaToken) { alert(CONFIG.MESSAGES.ERROR_RECAPTCHA); return; }
    const customer = getFormData(); if (!customer) return;
    if (!state.currentShippingRate) { alert("Veuillez choisir la livraison."); return; }
    
    const subTotal = state.cart.reduce((acc, i) => acc + (i.price * i.qty), 0);
    const shippingCost = state.currentShippingRate ? parseFloat(state.currentShippingRate.price) : 0;
    const discount = state.appliedPromoCode ? state.promoDiscountAmount : 0;
    const baseTotal = Math.max(0, subTotal + shippingCost - discount);
    
    const fees = 0;
    const total = baseTotal + fees;

    const btn = document.getElementById('btn-pay-virement'); btn.disabled = true; btn.innerText = "Traitement...";
    
    const payload = { 
        action: 'recordManualOrder', 
        source: 'VIREMENT', 
        recaptchaToken: recaptchaToken, 
        cart: state.cart, 
        total: total.toFixed(2), 
        client: customer, 
        promoCode: state.appliedPromoCode,
        shippingRate: state.currentShippingRate 
    };
    
    fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify(payload) })
        .then(res => res.json())
        .then(res => {
            if(res.error) throw new Error(res.error);
            closePanel(document.getElementById('modal-checkout'));
            localStorage.removeItem('kicks_cart'); 
            state.cart = []; updateCartUI();
            
            const ribDetails = state.siteContent.RIB || "IBAN: N/A, BIC: N/A";
            const ribHtml = `<div style="text-align:left; background:var(--bg-secondary); color:var(--text-primary); padding:20px; border-radius:8px; margin-top:20px; font-size:0.9rem;"><h3>Détails du Virement</h3><p>Montant à régler : <strong>${formatPrice(total)}</strong></p><p>Référence : <strong>${res.id}</strong></p><p>${ribDetails}</p><p style="color:red; font-weight:bold;">*Votre commande sera expédiée après réception et vérification du virement.</p></div>`;
            showSuccessScreen(customer.prenom, `Commande enregistrée (Réf: ${res.id}). Veuillez effectuer le virement bancaire pour validation.` + ribHtml);
        })
        .catch(e => { alert("Erreur: "+e.message); btn.disabled = false; btn.innerText = "💶 Confirmer le Virement"; });
}

// B. STRIPE (Backend: createCheckoutSession)
async function handleStripePayment() {
    const recaptchaToken = getRecaptchaResponse();
    if (!recaptchaToken) { alert(CONFIG.MESSAGES.ERROR_RECAPTCHA); return; }
    const customer = getFormData(); if (!customer) return;
    if (!state.currentShippingRate) { alert("Choisissez une livraison."); return; }

    const btn = document.getElementById('btn-pay-stripe'); btn.disabled = true;
    
    const payload = {
        action: 'createCheckoutSession', 
        recaptchaToken: recaptchaToken, 
        cart: state.cart,
        customerDetails: customer, 
        customerEmail: customer.email, 
        shippingRate: state.currentShippingRate,
        promoCode: state.appliedPromoCode,
        successUrl: window.location.origin + window.location.pathname + "?payment=success",
        cancelUrl: window.location.origin + window.location.pathname
    };
    
    if (state.currentPaymentMethod === 'KLARNA') {
        payload.paymentMethod = 'KLARNA';
    } else {
        payload.paymentMethod = 'CARD';
    }

    try {
        const res = await fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify(payload) });
        const json = await res.json();
        if (json.url) window.location.href = json.url;
        else throw new Error(json.error || "Erreur Session Stripe/Klarna");
    } catch (e) {
        alert(e.message); btn.disabled = false;
        if(window.grecaptcha) grecaptcha.reset();
    }
}

// C. PAYPAL (Backend: recordManualOrder après succès)
function initPayPalButtons() {
    const container = document.getElementById('paypal-button-container'); 
    if (!container) return;
    container.innerHTML = "";
    if (!window.paypal) return console.warn("PayPal SDK Missing");
    
    if(window.grecaptcha && state.recaptchaWidgetId !== null) grecaptcha.reset(state.recaptchaWidgetId);

    window.paypal.Buttons({
        fundingSource: window.paypal.FUNDING.PAYLATER,
        style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay' },
        onClick: function(data, actions) {
            const token = getRecaptchaResponse();
            if (!token) { alert(CONFIG.MESSAGES.ERROR_RECAPTCHA); return actions.reject(); }
            const customer = getFormData();
            if (!customer || !state.currentShippingRate) { alert(CONFIG.MESSAGES.ERROR_FORM + " / Choix de livraison manquant."); return actions.reject(); }
            return actions.resolve();
        },
        createOrder: function(data, actions) {
            const sub = state.cart.reduce((acc, i) => acc + i.price * i.qty, 0);
            const ship = state.currentShippingRate ? parseFloat(state.currentShippingRate.price) : 0;
            const base = Math.max(0, sub + ship - state.promoDiscountAmount);
            const fees = (base * CONFIG.FEES.PAYPAL_4X.percent) + CONFIG.FEES.PAYPAL_4X.fixed;
            return actions.order.create({ purchase_units: [{ amount: { value: (base+fees).toFixed(2) } }] });
        },
        onApprove: function(data, actions) {
            return actions.order.capture().then(function(details) {
                const customer = getFormData(); 
                const token = getRecaptchaResponse(); 
                
                const totalWithFees = details.purchase_units[0].amount.value;

                const payload = { 
                    action: 'recordManualOrder', 
                    source: 'PAYPAL_4X', 
                    recaptchaToken: token, 
                    paymentId: details.id, 
                    total: totalWithFees,
                    cart: state.cart, 
                    client: customer, 
                    promoCode: state.appliedPromoCode,
                    shippingRate: state.currentShippingRate 
                };
                fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify(payload) }).then(() => { window.location.href = "?payment=success"; });
            });
        }
    }).render('#paypal-button-container');
}

/* --- HELPERS --- */

async function applyPromoCode() {
    const recaptchaToken = getRecaptchaResponse();
    if (!recaptchaToken) { alert(CONFIG.MESSAGES.ERROR_RECAPTCHA); return; }
    const input = document.getElementById('promo-code-input');
    const msg = document.getElementById('promo-message');
    const code = input.value.trim().toUpperCase(); if (!code) return;
    
    msg.innerText = "Vérification...";
    try {
        const res = await fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify({ action: 'checkPromo', code: code, recaptchaToken: recaptchaToken }) });
        const data = await res.json();
        
        if (data.valid) {
            state.appliedPromoCode = code;
            state.promoDiscountAmount = state.cart.reduce((acc, i) => acc + i.price * i.qty, 0) * data.discountPercent;
            msg.innerText = `Code appliqué : -${(data.discountPercent*100).toFixed(0)}% !`; msg.style.color = "green";
            updateCheckoutTotal();
        } else {
            msg.innerText = "Code invalide."; msg.style.color = "red";
            state.appliedPromoCode = null; state.promoDiscountAmount = 0; updateCheckoutTotal();
        }
        if(window.grecaptcha) grecaptcha.reset();
    } catch (e) { msg.innerText = "Erreur."; }
}

function getFormData() {
    const val = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
    const pays = document.getElementById('ck-pays');
    
    const requiredFields = { email: 'ck-email', prenom: 'ck-prenom', nom: 'ck-nom', tel: 'ck-tel', adresse: 'ck-adresse', cp: 'ck-cp', ville: 'ck-ville' };
    
    for (let key in requiredFields) {
        if (!val(requiredFields[key])) { 
            alert(`Veuillez remplir le champ : ${key.toUpperCase()}.`); 
            return null; 
        }
    }
    
    if (!pays || !pays.value) { 
        alert("Veuillez choisir le pays de livraison."); 
        return null; 
    }
    
    return { 
        email: val('ck-email'), prenom: val('ck-prenom'), nom: val('ck-nom'), tel: val('ck-tel'), 
        adresse: val('ck-adresse'), cp: val('ck-cp'), ville: val('ck-ville'), 
        pays: pays.value 
    };
}
