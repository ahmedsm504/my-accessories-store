// ==================== المتغيرات العالمية ====================
let supabaseClient = null;
let SUPABASE_URL = localStorage.getItem('supabaseUrl') || '';
let SUPABASE_KEY = localStorage.getItem('supabaseKey') || '';
const ADMIN_PASSWORD = 'admin123';
let isAdminLoggedIn = false;
let currentFilter = 'all';
let products = [];
let categories = [];
let orders = [];
let cart = JSON.parse(localStorage.getItem('cart')) || [];

// ==================== دوال النوافذ المنبثقة ====================
function openAdminLoginModal() {
    console.log("Opening admin login modal");
    document.getElementById('adminLoginModal').classList.add('active');
}

function closeAdminLoginModal() {
    document.getElementById('adminLoginModal').classList.remove('active');
}

function openCartModal() {
    console.log("Opening cart modal");
    updateCartDisplay();
    document.getElementById('cartModal').classList.add('active');
}

function closeCartModal() {
    document.getElementById('cartModal').classList.remove('active');
}

function openOrderSuccessModal() {
    document.getElementById('orderSuccessModal').classList.add('active');
}

function closeOrderSuccessModal() {
    document.getElementById('orderSuccessModal').classList.remove('active');
    showStore();
}

// ==================== إدارة السلة ====================
function updateCartCount() {
    const totalItems = cart.reduce((total, item) => total + item.quantity, 0);
    document.getElementById('cartCount').textContent = totalItems;
}

function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    
    if (!product) {
        showToast('خطأ', 'المنتج غير موجود', 'error');
        return;
    }
    
    if (product.quantity === 0) {
        showToast('خطأ', 'هذا المنتج غير متوفر حالياً', 'error');
        return;
    }
    
    const cartItemIndex = cart.findIndex(item => item.productId === productId);
    
    if (cartItemIndex > -1) {
        cart[cartItemIndex].quantity += 1;
    } else {
        cart.push({
            productId: product.id,
            name: product.name,
            price: product.price,
            quantity: 1,
            image: product.image_url || ''
        });
    }
    
    updateCartCount();
    saveCart();
    showToast('تمت الإضافة', `تمت إضافة ${product.name} إلى السلة`, 'success');
}

function updateCartDisplay() {
    const container = document.getElementById('cartItemsContainer');
    const itemsCountElement = document.getElementById('cartItemsCount');
    const subtotalElement = document.getElementById('cartSubtotal');
    const totalElement = document.getElementById('cartTotal');
    
    if (cart.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 40px;">
                <i class="fas fa-shopping-cart" style="font-size: 3em;"></i>
                <h3>سلة التسوق فارغة</h3>
                <p>أضف بعض المنتجات إلى السلة</p>
            </div>
        `;
        itemsCountElement.textContent = '0';
        subtotalElement.textContent = '0 ج.م';
        totalElement.textContent = '0 ج.م';
        return;
    }
    
    let subtotal = 0;
    
    container.innerHTML = cart.map(item => {
        const itemTotal = item.price * item.quantity;
        subtotal += itemTotal;
        
        return `
            <div class="cart-item">
                <div class="cart-item-info">
                    <div class="cart-item-name">${item.name}</div>
                    <div class="cart-item-price">${item.price} ج.م للقطعة</div>
                </div>
                <div class="cart-item-quantity">
                    <button class="quantity-btn" onclick="updateCartItem(${item.productId}, ${item.quantity - 1})">-</button>
                    <span style="font-weight: 700; min-width: 30px; text-align: center;">${item.quantity}</span>
                    <button class="quantity-btn" onclick="updateCartItem(${item.productId}, ${item.quantity + 1})">+</button>
                </div>
                <div style="font-weight: 700; color: var(--secondary); min-width: 80px; text-align: left;">
                    ${itemTotal.toFixed(2)} ج.م
                </div>
                <button class="quantity-btn" style="border-color: var(--danger); color: var(--danger);" onclick="removeFromCart(${item.productId})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
    }).join('');
    
    itemsCountElement.textContent = cart.reduce((total, item) => total + item.quantity, 0);
    subtotalElement.textContent = subtotal.toFixed(2) + ' ج.م';
    totalElement.textContent = subtotal.toFixed(2) + ' ج.م';
}

function updateCartItem(productId, newQuantity) {
    const cartItemIndex = cart.findIndex(item => item.productId === productId);
    
    if (cartItemIndex > -1) {
        if (newQuantity <= 0) {
            cart.splice(cartItemIndex, 1);
        } else {
            cart[cartItemIndex].quantity = newQuantity;
        }
        
        updateCartCount();
        updateCartDisplay();
        saveCart();
    }
}

function removeFromCart(productId) {
    cart = cart.filter(item => item.productId !== productId);
    updateCartCount();
    updateCartDisplay();
    saveCart();
    showToast('تم الحذف', 'تم حذف المنتج من السلة', 'success');
}

function saveCart() {
    localStorage.setItem('cart', JSON.stringify(cart));
}

function clearCart() {
    cart = [];
    updateCartCount();
    saveCart();
}

// ==================== إدارة المتجر ====================
function showStore() {
    document.getElementById('publicContainer').style.display = 'block';
    document.getElementById('adminContainer').style.display = 'none';
    displayProducts();
}

function showAdminDashboard() {
    document.getElementById('publicContainer').style.display = 'none';
    document.getElementById('adminContainer').style.display = 'block';
    if (isAdminLoggedIn) {
        // عرض صفحة الطلبات أولاً
        showAdminPage('orders');
    }
}

function displayProducts() {
    const container = document.getElementById('productsContainer');
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
    
    let filteredProducts = products;
    
    if (currentFilter !== 'all') {
        filteredProducts = filteredProducts.filter(p => p.category === currentFilter);
    }
    
    if (searchTerm) {
        filteredProducts = filteredProducts.filter(p => 
            p.name.toLowerCase().includes(searchTerm) ||
            (p.description && p.description.toLowerCase().includes(searchTerm)) ||
            p.category.toLowerCase().includes(searchTerm)
        );
    }
    
    filteredProducts = filteredProducts.filter(p => p.status === 'available' && p.quantity > 0);
    
    if (filteredProducts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search" style="font-size: 3em;"></i>
                <h3>لا توجد منتجات</h3>
                <p>${searchTerm ? 'لا توجد نتائج للبحث' : 'لا توجد منتجات في هذا التصنيف'}</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filteredProducts.map(product => {
        const imageHtml = product.image_url 
            ? `<img src="${product.image_url}" alt="${product.name}" style="max-width: 100%; max-height: 100%; object-fit: contain;">` 
            : `<i class="fas fa-box" style="font-size: 4em; color: #ccc;"></i>`;
            
        return `
            <div class="product-card">
                <div class="product-image">
                    ${imageHtml}
                    <span class="product-badge category-badge">${product.category}</span>
                    <span class="status-badge in-stock">
                        متوفر
                    </span>
                </div>
                <div class="product-info">
                    <div class="product-name">${product.name}</div>
                    <div class="product-desc">${product.description || 'لا يوجد وصف'}</div>
                    <div class="product-details">
                        <div class="product-price">${product.price} ج.م</div>
                        <div class="product-quantity">
                            <i class="fas fa-layer-group"></i> ${product.quantity}
                        </div>
                    </div>
                    <div class="product-actions">
                        <button class="btn btn-primary" onclick="addToCart(${product.id})">
                            <i class="fas fa-cart-plus"></i> أضف إلى السلة
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function searchProducts() {
    displayProducts();
}

function updateCategoryFilters() {
    const container = document.getElementById('categoryFilters');
    const filterButtons = categories.map(cat => {
        const count = products.filter(p => p.category === cat && p.status === 'available' && p.quantity > 0).length;
        if (count === 0) return '';
        
        return `<button class="category-filter-btn ${currentFilter === cat ? 'active' : ''}" onclick="filterByCategory('${cat}')">${cat} (${count})</button>`;
    }).join('');
    
    const allCount = products.filter(p => p.status === 'available' && p.quantity > 0).length;
    
    container.innerHTML = `
        <button class="category-filter-btn ${currentFilter === 'all' ? 'active' : ''}" onclick="filterByCategory('all')">الكل (${allCount})</button>
        ${filterButtons}
    `;
}

function filterByCategory(category) {
    currentFilter = category;
    displayProducts();
    updateCategoryFilters();
}

// ==================== إدارة الطلبات ====================
async function placeOrder() {
    const customerPhone = document.getElementById('customerPhone').value.trim();
    const orderNotes = document.getElementById('orderNotes').value.trim();
    
    if (!customerPhone) {
        showToast('خطأ', 'الرجاء إدخال رقم الهاتف', 'error');
        return;
    }
    
    if (cart.length === 0) {
        showToast('خطأ', 'السلة فارغة', 'error');
        return;
    }
    
    for (const cartItem of cart) {
        const product = products.find(p => p.id === cartItem.productId);
        if (!product || product.quantity < cartItem.quantity) {
            showToast('خطأ', `الكمية المطلوبة من ${cartItem.name} غير متوفرة`, 'error');
            return;
        }
    }
    
    try {
        const orderData = {
            customer_name: 'زبون',
            customer_phone: customerPhone,
            items: cart.map(item => ({
                productId: item.productId,
                name: item.name,
                price: item.price,
                quantity: item.quantity
            })),
            total: cart.reduce((total, item) => total + (item.price * item.quantity), 0),
            status: 'pending',
            notes: orderNotes
        };
        
        if (!supabaseClient) {
            showToast('خطأ', 'لا يوجد اتصال بقاعدة البيانات', 'error');
            return;
        }
        
        const { data: newOrder, error: orderError } = await supabaseClient
            .from('orders')
            .insert([orderData])
            .select();
        
        if (orderError) throw orderError;
        
        for (const cartItem of cart) {
            const product = products.find(p => p.id === cartItem.productId);
            const newQuantity = product.quantity - cartItem.quantity;
            const newStatus = newQuantity > 0 ? 'available' : 'unavailable';
            
            const { error: updateError } = await supabaseClient
                .from('products')
                .update({ 
                    quantity: newQuantity,
                    status: newStatus
                })
                .eq('id', cartItem.productId);
            
            if (updateError) throw updateError;
        }
        
        document.getElementById('orderNumber').textContent = `#${newOrder[0].id}`;
        
        closeCartModal();
        setTimeout(() => {
            openOrderSuccessModal();
        }, 300);
        
        clearCart();
        await loadDataFromSupabase();
        showToast('تم الطلب', `تم استلام طلبك برقم #${newOrder[0].id}`, 'success');
        
    } catch (error) {
        console.error('❌ خطأ في حفظ الطلب:', error);
        showToast('خطأ', 'فشل حفظ الطلب: ' + error.message, 'error');
    }
}

function displayOrders() {
    const container = document.getElementById('ordersContainer');
    
    if (orders.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-clipboard-list" style="font-size: 3em;"></i>
                <h3>لا توجد طلبات</h3>
                <p>لم يتم استلام أي طلبات حتى الآن</p>
            </div>
        `;
        return;
    }
    
    const sortedOrders = [...orders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    container.innerHTML = sortedOrders.map(order => {
        const statusColors = {
            'pending': 'status-pending',
            'processing': 'status-processing',
            'completed': 'status-completed'
        };
        
        const statusTexts = {
            'pending': 'قيد الانتظار',
            'processing': 'قيد التجهيز',
            'completed': 'مكتمل'
        };
        
        const date = new Date(order.created_at).toLocaleString('ar-EG');
        
        return `
            <div class="order-card">
                <div class="order-header">
                    <div class="order-number">طلب #${order.id}</div>
                    <div class="order-status ${statusColors[order.status]}">
                        ${statusTexts[order.status]}
                    </div>
                </div>
                
                <div class="order-customer">
                    <i class="fas fa-user" style="font-size: 1.5em; color: var(--info);"></i>
                    <div class="customer-info">
                        <h4>${order.customer_name}</h4>
                        <p>
                            <i class="fas fa-phone" style="margin-left: 5px;"></i>
                            ${order.customer_phone}
                            <button style="border: none; background: none; color: var(--info); margin-right: 10px;" onclick="copyPhoneNumber('${order.customer_phone}')" title="نسخ الرقم">
                                <i class="fas fa-copy"></i>
                            </button>
                            <a href="https://wa.me/2${order.customer_phone.replace(/^0/, '')}" target="_blank" style="color: var(--success); text-decoration: none; margin-right: 10px;">
                                <i class="fab fa-whatsapp"></i> واتساب
                            </a>
                        </p>
                        <p style="margin-top: 5px; font-size: 0.8em; color: #999;">
                            <i class="fas fa-clock"></i> ${date}
                        </p>
                    </div>
                </div>
                
                <div class="order-items">
                    ${Array.isArray(order.items) ? order.items.map(item => `
                        <div class="order-item">
                            <span class="item-name">${item.name}</span>
                            <span class="item-quantity">${item.quantity}x</span>
                            <span class="item-price">${(item.price * item.quantity).toFixed(2)} ج.م</span>
                        </div>
                    `).join('') : ''}
                </div>
                
                <div class="order-total">
                    <span class="total-label">الإجمالي:</span>
                    <span class="total-amount">${order.total.toFixed(2)} ج.م</span>
                </div>
                
                ${order.notes ? `
                    <div style="background: #f8f9fa; padding: 10px 15px; border-radius: 8px; margin-bottom: 15px;">
                        <p style="font-weight: 700; margin-bottom: 5px;">ملاحظات الزبون:</p>
                        <p style="color: #666; font-size: 0.9em;">${order.notes}</p>
                    </div>
                ` : ''}
                
                <div class="order-actions">
                    <button class="btn btn-primary" onclick="updateOrderStatus(${order.id}, 'processing')" ${order.status !== 'pending' ? 'disabled' : ''} style="flex: 1;">
                        <i class="fas fa-cogs"></i> بدء التجهيز
                    </button>
                    <button class="btn btn-success" onclick="updateOrderStatus(${order.id}, 'completed')" ${order.status === 'completed' ? 'disabled' : ''} style="flex: 1;">
                        <i class="fas fa-check"></i> إكمال الطلب
                    </button>
                    <button class="btn btn-danger" onclick="deleteOrder(${order.id})" style="flex: 1;">
                        <i class="fas fa-trash"></i> حذف
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function updateOrderStatus(orderId, newStatus) {
    try {
        const { error } = await supabaseClient
            .from('orders')
            .update({ status: newStatus })
            .eq('id', orderId);
        
        if (error) throw error;
        
        await loadDataFromSupabase();
        
        const statusTexts = {
            'pending': 'قيد الانتظار',
            'processing': 'قيد التجهيز',
            'completed': 'مكتمل'
        };
        
        showToast('تم التحديث', `تم تغيير حالة الطلب إلى ${statusTexts[newStatus]}`, 'success');
        
    } catch (error) {
        console.error('❌ خطأ في تحديث حالة الطلب:', error);
        showToast('خطأ', 'فشل تحديث حالة الطلب: ' + error.message, 'error');
    }
}

async function deleteOrder(orderId) {
    if (!confirm('هل أنت متأكد من حذف هذا الطلب؟')) {
        return;
    }
    
    try {
        const order = orders.find(o => o.id === orderId);
        if (order && Array.isArray(order.items)) {
            for (const item of order.items) {
                const product = products.find(p => p.id === item.productId);
                if (product) {
                    const newQuantity = product.quantity + item.quantity;
                    const newStatus = newQuantity > 0 ? 'available' : 'unavailable';
                    
                    await supabaseClient
                        .from('products')
                        .update({ 
                            quantity: newQuantity,
                            status: newStatus
                        })
                        .eq('id', item.productId);
                }
            }
        }
        
        const { error } = await supabaseClient
            .from('orders')
            .delete()
            .eq('id', orderId);
        
        if (error) throw error;
        
        await loadDataFromSupabase();
        
        showToast('تم الحذف', 'تم حذف الطلب بنجاح', 'success');
        
    } catch (error) {
        console.error('❌ خطأ في حذف الطلب:', error);
        showToast('خطأ', 'فشل حذف الطلب: ' + error.message, 'error');
    }
}

function updateOrderContacts() {
    const container = document.getElementById('orderContacts');
    
    const customerPhones = [];
    orders.forEach(order => {
        if (order.status !== 'completed' && !customerPhones.includes(order.customer_phone)) {
            customerPhones.push(order.customer_phone);
        }
    });
    
    if (customerPhones.length === 0) {
        container.innerHTML = '<p>لا توجد أرقام زبائن حالياً</p>';
        return;
    }
    
    container.innerHTML = customerPhones.map(phone => `
        <div class="contact-number">
            <i class="fas fa-phone"></i>
            <span>${phone}</span>
            <button style="border: none; background: none; color: white;" onclick="copyPhoneNumber('${phone}')" title="نسخ الرقم">
                <i class="fas fa-copy"></i>
            </button>
            <a href="https://wa.me/2${phone.replace(/^0/, '')}" target="_blank" style="color: white; text-decoration: none;">
                <i class="fab fa-whatsapp"></i>
            </a>
        </div>
    `).join('');
}

function copyPhoneNumber(phone) {
    navigator.clipboard.writeText(phone).then(() => {
        showToast('تم النسخ', `تم نسخ الرقم: ${phone}`, 'success');
    });
}

async function refreshOrders() {
    await loadDataFromSupabase();
    showToast('تم التحديث', 'تم تحديث قائمة الطلبات', 'success');
}

// ==================== إدارة لوحة التحكم ====================
function loginAdmin() {
    const password = document.getElementById('adminPassword').value;
    const adminPhone = document.getElementById('adminPhone').value.trim();
    
    if (password !== ADMIN_PASSWORD) {
        showToast('خطأ', 'كلمة المرور غير صحيحة', 'error');
        return;
    }
    
    isAdminLoggedIn = true;
    
    if (adminPhone) {
        localStorage.setItem('adminPhone', adminPhone);
        updateAdminPhoneDisplay();
    }
    
    closeAdminLoginModal();
    showAdminDashboard();
    showToast('مرحباً', 'تم تسجيل الدخول بنجاح', 'success');
}

function logoutAdmin() {
    if (confirm('هل تريد تسجيل الخروج من لوحة التحكم؟')) {
        isAdminLoggedIn = false;
        showStore();
        showToast('تم الخروج', 'تم تسجيل الخروج بنجاح', 'success');
    }
}

function showAdminPage(page, clickedElement) {
    console.log('Showing admin page:', page);
    
    // إخفاء جميع الصفحات
    document.querySelectorAll('.admin-page').forEach(el => {
        el.classList.remove('active');
    });
    
    // إزالة التفعيل من جميع التابات
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // عرض الصفحة المطلوبة
    const pageElement = document.getElementById(page + 'Page');
    if (pageElement) {
        pageElement.classList.add('active');
        console.log('Page element found and activated:', page);
    } else {
        console.error('Page element not found:', page + 'Page');
    }
    
    // تفعيل التاب المناسب
    if (clickedElement) {
        clickedElement.classList.add('active');
    } else {
        // البحث عن التاب المناسب
        document.querySelectorAll('.nav-tab').forEach(tab => {
            const onclickAttr = tab.getAttribute('onclick');
            if (onclickAttr && onclickAttr.includes(page)) {
                tab.classList.add('active');
            }
        });
    }
    
    // تنفيذ الإجراءات الخاصة بكل صفحة
    switch(page) {
        case 'orders':
            displayOrders();
            updateOrderContacts();
            break;
        case 'products':
            adminSearchProducts();
            updateAdminCategoryFilters();
            break;
        case 'add-product':
            resetProductForm();
            updateCategorySelects();
            break;
        case 'categories':
            displayCategories();
            break;
        case 'settings':
            loadSupabaseSettings();
            break;
    }
}

function updateAdminPhoneDisplay() {
    const adminPhone = localStorage.getItem('adminPhone') || '01XXXXXXXXX';
    const phoneElement = document.getElementById('adminPhoneNumber');
    if (phoneElement) {
        phoneElement.textContent = adminPhone;
    }
    const phoneInput = document.getElementById('adminPhone');
    if (phoneInput) {
        phoneInput.value = adminPhone;
    }
}

// ==================== إدارة المنتجات (للمدير) ====================
function updateAdminCategoryFilters() {
    const container = document.getElementById('adminCategoryFilters');
    if (!container) return;
    
    const filterButtons = categories.map(cat => {
        const count = products.filter(p => p.category === cat).length;
        return `<button class="category-filter-btn ${currentFilter === cat ? 'active' : ''}" onclick="adminFilterByCategory('${cat}')">${cat} (${count})</button>`;
    }).join('');
    
    const allCount = products.length;
    
    container.innerHTML = `
        <button class="category-filter-btn ${currentFilter === 'all' ? 'active' : ''}" onclick="adminFilterByCategory('all')">الكل (${allCount})</button>
        ${filterButtons}
    `;
}

function adminFilterByCategory(category) {
    currentFilter = category;
    updateAdminCategoryFilters();
    adminSearchProducts();
}

function adminSearchProducts() {
    const container = document.getElementById('adminProductsContainer');
    if (!container) return;
    
    const searchTerm = document.getElementById('adminSearchInput')?.value.toLowerCase() || '';
    
    let filteredProducts = products;
    
    if (currentFilter !== 'all') {
        filteredProducts = filteredProducts.filter(p => p.category === currentFilter);
    }
    
    if (searchTerm) {
        filteredProducts = filteredProducts.filter(p => 
            p.name.toLowerCase().includes(searchTerm) ||
            (p.description && p.description.toLowerCase().includes(searchTerm)) ||
            p.category.toLowerCase().includes(searchTerm)
        );
    }
    
    if (filteredProducts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search" style="font-size: 3em;"></i>
                <h3>لا توجد منتجات</h3>
                <p>${searchTerm ? 'لا توجد نتائج للبحث' : 'لا توجد منتجات في هذا التصنيف'}</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filteredProducts.map(product => {
        const imageHtml = product.image_url 
            ? `<img src="${product.image_url}" alt="${product.name}" style="max-width: 100%; max-height: 100%; object-fit: contain;">` 
            : `<i class="fas fa-box" style="font-size: 4em; color: #ccc;"></i>`;
            
        return `
            <div class="product-card">
                <div class="product-image">
                    ${imageHtml}
                    <span class="product-badge category-badge">${product.category}</span>
                    <span class="status-badge ${product.status === 'available' ? 'in-stock' : 'out-stock'}">
                        ${product.status === 'available' ? 'متوفر' : 'غير متوفر'}
                    </span>
                </div>
                <div class="product-info">
                    <div class="product-name">${product.name}</div>
                    <div class="product-desc">${product.description || 'لا يوجد وصف'}</div>
                    <div class="product-details">
                        <div class="product-price">${product.price} ج.م</div>
                        <div class="product-quantity">
                            <i class="fas fa-layer-group"></i> ${product.quantity}
                        </div>
                    </div>
                    <div class="product-actions">
                        <button class="btn btn-primary" onclick="editProduct(${product.id})" style="flex: 1;">
                            <i class="fas fa-edit"></i> تعديل
                        </button>
                        <button class="btn btn-danger" onclick="deleteProduct(${product.id})" style="flex: 1;">
                            <i class="fas fa-trash"></i> حذف
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function saveProduct(event) {
    event.preventDefault();
    console.log('🔄 بدء حفظ المنتج...');
    
    const id = document.getElementById('productId').value;
    const name = document.getElementById('productName').value.trim();
    const category = document.getElementById('productCategory').value;
    const price = parseFloat(document.getElementById('productPrice').value);
    const quantity = parseInt(document.getElementById('productQuantity').value);
    const status = document.getElementById('productStatus').value;
    const description = document.getElementById('productDescription').value.trim();
    const imageUrl = document.getElementById('productImageUrl')?.value.trim() || '';
    
    console.log('📝 بيانات المنتج:', { id, name, category, price, quantity, status, description, imageUrl });
    
    if (!name || !category || isNaN(price) || isNaN(quantity)) {
        showToast('خطأ', 'الرجاء ملء جميع الحقول المطلوبة', 'error');
        return;
    }
    
    if (!supabaseClient) {
        showToast('خطأ', 'لا يوجد اتصال بقاعدة البيانات. تأكد من إعدادات Supabase', 'error');
        return;
    }
    
    try {
        const productData = {
            name,
            category,
            price,
            quantity,
            status: quantity > 0 ? status : 'unavailable',
            description,
            image_url: imageUrl
        };
        
        console.log('📤 إرسال البيانات إلى Supabase:', productData);
        
        if (id) {
            // تعديل منتج موجود
            const { data, error } = await supabaseClient
                .from('products')
                .update(productData)
                .eq('id', id)
                .select();
            
            if (error) throw error;
            console.log('✅ تم تحديث المنتج:', data);
            showToast('نجاح', 'تم تحديث المنتج بنجاح! ✓', 'success');
            
        } else {
            // إضافة منتج جديد
            const { data, error } = await supabaseClient
                .from('products')
                .insert([productData])
                .select();
            
            if (error) throw error;
            console.log('✅ تم إضافة المنتج:', data);
            showToast('نجاح', 'تم إضافة المنتج بنجاح! ✓', 'success');
        }
        
        // إعادة تحميل البيانات
        await loadDataFromSupabase();
        
        // العودة لصفحة المنتجات
        setTimeout(() => {
            showAdminPage('products');
        }, 1000);
        
    } catch (error) {
        console.error('❌ خطأ في حفظ المنتج:', error);
        showToast('خطأ', 'فشل حفظ المنتج: ' + error.message, 'error');
    }
}

function editProduct(id) {
    console.log('✏️ تعديل المنتج:', id);
    const product = products.find(p => p.id == id);
    
    if (!product) {
        showToast('خطأ', 'المنتج غير موجود', 'error');
        return;
    }
    
    console.log('📄 بيانات المنتج:', product);
    
    // ملء النموذج
    document.getElementById('productId').value = product.id;
    document.getElementById('productName').value = product.name;
    document.getElementById('productCategory').value = product.category;
    document.getElementById('productPrice').value = product.price;
    document.getElementById('productQuantity').value = product.quantity;
    document.getElementById('productStatus').value = product.status;
    document.getElementById('productDescription').value = product.description || '';
    
    const imageUrlInput = document.getElementById('productImageUrl');
    if (imageUrlInput) {
        imageUrlInput.value = product.image_url || '';
    }
    
    // تغيير عنوان النموذج
    const titleElement = document.getElementById('productFormTitle');
    if (titleElement) {
        titleElement.innerHTML = '<i class="fas fa-edit"></i> تعديل المنتج';
    }
    
    const submitBtn = document.getElementById('productSubmitBtn');
    if (submitBtn) {
        submitBtn.innerHTML = '<i class="fas fa-save"></i> حفظ التغييرات';
    }
    
    // الانتقال إلى صفحة إضافة/تعديل المنتج
    showAdminPage('add-product');
    
    console.log('✅ تم تحميل بيانات المنتج في النموذج');
}

async function deleteProduct(id) {
    if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) {
        return;
    }
    
    if (!supabaseClient) {
        showToast('خطأ', 'لا يوجد اتصال بقاعدة البيانات', 'error');
        return;
    }
    
    try {
        const { error } = await supabaseClient
            .from('products')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        
        await loadDataFromSupabase();
        
        showToast('نجاح', 'تم حذف المنتج بنجاح', 'success');
        
    } catch (error) {
        console.error('❌ خطأ في حذف المنتج:', error);
        showToast('خطأ', 'فشل حذف المنتج: ' + error.message, 'error');
    }
}

function resetProductForm() {
    console.log('🔄 إعادة تعيين النموذج');
    
    const form = document.getElementById('productForm');
    if (form) {
        form.reset();
    }
    
    document.getElementById('productId').value = '';
    
    const titleElement = document.getElementById('productFormTitle');
    if (titleElement) {
        titleElement.innerHTML = '<i class="fas fa-plus-circle"></i> إضافة منتج جديد';
    }
    
    const submitBtn = document.getElementById('productSubmitBtn');
    if (submitBtn) {
        submitBtn.innerHTML = '<i class="fas fa-save"></i> حفظ المنتج';
    }
    
    updateCategorySelects();
    console.log('✅ تم إعادة تعيين النموذج');
}

function updateCategorySelects() {
    const select = document.getElementById('productCategory');
    if (!select) return;
    
    select.innerHTML = '<option value="">اختر التصنيف</option>' + 
        categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    
    console.log('✅ تم تحديث قائمة التصنيفات:', categories.length);
}

// ==================== إدارة التصنيفات ====================
function displayCategories() {
    const container = document.getElementById('categoriesList');
    if (!container) return;
    
    if (categories.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #999; padding: 30px; background: #f8f9fa; border-radius: 12px;">لا توجد تصنيفات حالياً</p>';
        return;
    }
    
    container.innerHTML = categories.map(category => {
        const count = products.filter(p => p.category === category).length;
        return `
            <div style="background: linear-gradient(135deg, var(--info), #118ab2); color: white; padding: 12px 20px; border-radius: 25px; display: flex; align-items: center; gap: 10px;">
                <span>${category}</span>
                <span style="background: rgba(255,255,255,0.3); padding: 2px 8px; border-radius: 15px; font-size: 0.9em;">${count}</span>
                <div style="display: flex; gap: 5px;">
                    <button onclick="editCategory('${category}')" title="تعديل" style="background: rgba(255,255,255,0.3); border: none; color: white; width: 30px; height: 30px; border-radius: 50%; cursor: pointer;">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="deleteCategory('${category}')" title="حذف" style="background: rgba(255,255,255,0.3); border: none; color: white; width: 30px; height: 30px; border-radius: 50%; cursor: pointer;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function saveCategory(event) {
    event.preventDefault();
    
    const categoryName = document.getElementById('categoryName').value.trim();
    const categoryId = document.getElementById('categoryId').value;
    
    if (!categoryName) {
        showToast('خطأ', 'الرجاء إدخال اسم التصنيف', 'error');
        return;
    }
    
    if (!supabaseClient) {
        showToast('خطأ', 'لا يوجد اتصال بقاعدة البيانات', 'error');
        return;
    }
    
    try {
        if (categoryId) {
            // تعديل تصنيف موجود
            const originalName = categoryId;
            
            if (originalName === categoryName) {
                showToast('معلومة', 'لم يتم تغيير اسم التصنيف', 'success');
                resetCategoryForm();
                return;
            }
            
            const categoriesLower = categories.map(c => c.toLowerCase());
            if (categoriesLower.includes(categoryName.toLowerCase()) && 
                categoryName.toLowerCase() !== originalName.toLowerCase()) {
                showToast('خطأ', 'هذا التصنيف موجود بالفعل!', 'error');
                return;
            }
            
            const { error: updateError } = await supabaseClient
                .from('products')
                .update({ category: categoryName })
                .eq('category', originalName);
            
            if (updateError) throw updateError;
            
            showToast('نجاح', 'تم تحديث التصنيف بنجاح', 'success');
            
        } else {
            // إضافة تصنيف جديد
            const categoriesLower = categories.map(c => c.toLowerCase());
            if (categoriesLower.includes(categoryName.toLowerCase())) {
                showToast('خطأ', 'هذا التصنيف موجود بالفعل!', 'error');
                return;
            }
            
            const { data: categoryData, error: insertError } = await supabaseClient
                .from('categories')
                .insert([{ name: categoryName }])
                .select();
            
            if (insertError) {
                if (insertError.code === '42P01') {
                    showToast('خطأ', 'جدول التصنيفات غير موجود. يرجى إنشاء الجدول في Supabase', 'error');
                }
                throw insertError;
            }
            
            showToast('نجاح', 'تم إضافة التصنيف بنجاح', 'success');
        }
        
        await loadDataFromSupabase();
        resetCategoryForm();
        displayCategories();
        updateCategorySelects();
        
    } catch (error) {
        console.error('❌ خطأ في حفظ التصنيف:', error);
        showToast('خطأ', 'فشل حفظ التصنيف: ' + error.message, 'error');
    }
}

function editCategory(categoryName) {
    document.getElementById('categoryName').value = categoryName;
    document.getElementById('categoryId').value = categoryName;
    document.getElementById('categorySubmitBtn').innerHTML = '<i class="fas fa-save"></i> تحديث';
}

async function deleteCategory(categoryName) {
    const productsInCategory = products.filter(p => p.category === categoryName);
    
    if (productsInCategory.length > 0) {
        showToast('خطأ', `لا يمكن حذف هذا التصنيف لأنه يحتوي على ${productsInCategory.length} منتج`, 'error');
        return;
    }
    
    if (!confirm(`هل أنت متأكد من حذف تصنيف "${categoryName}"؟`)) {
        return;
    }
    
    if (!supabaseClient) {
        showToast('خطأ', 'لا يوجد اتصال بقاعدة البيانات', 'error');
        return;
    }
    
    try {
        const { error } = await supabaseClient
            .from('categories')
            .delete()
            .eq('name', categoryName);
        
        if (error) {
            if (error.code === '42P01') {
                showToast('خطأ', 'جدول التصنيفات غير موجود', 'error');
            }
            throw error;
        }
        
        await loadDataFromSupabase();
        displayCategories();
        updateCategorySelects();
        
        showToast('نجاح', 'تم حذف التصنيف بنجاح', 'success');
        
    } catch (error) {
        console.error('❌ خطأ في حذف التصنيف:', error);
        showToast('خطأ', 'فشل حذف التصنيف: ' + error.message, 'error');
    }
}

function resetCategoryForm() {
    document.getElementById('categoryForm').reset();
    document.getElementById('categoryId').value = '';
    document.getElementById('categorySubmitBtn').innerHTML = '<i class="fas fa-plus"></i> إضافة';
}

// ==================== إعدادات Supabase ====================
async function initSupabase() {
    try {
        if (!SUPABASE_URL || !SUPABASE_KEY) {
            console.log('⚠️ لم يتم تعيين بيانات Supabase');
            return false;
        }
        
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        
        const { data, error } = await supabaseClient.from('products').select('count');
        
        if (error) {
            console.error('❌ فشل الاتصال بـ Supabase:', error.message);
            return false;
        }
        
        console.log('✅ تم الاتصال بـ Supabase بنجاح');
        return true;
        
    } catch (error) {
        console.error('❌ خطأ في تهيئة Supabase:', error);
        return false;
    }
}

async function loadDataFromSupabase() {
    if (!supabaseClient) {
        console.log('⚠️ لا يوجد اتصال بـ Supabase');
        return;
    }
    
    try {
        // تحميل المنتجات
        const { data: productsData, error: productsError } = await supabaseClient
            .from('products')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (productsError) throw productsError;
        
        products = productsData || [];
        console.log('✅ تم تحميل المنتجات:', products.length);
        
        // تحميل الطلبات
        const { data: ordersData, error: ordersError } = await supabaseClient
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (ordersError) throw ordersError;
        
        orders = ordersData || [];
        console.log('✅ تم تحميل الطلبات:', orders.length);
        
        // تحميل التصنيفات
        try {
            const { data: categoriesData, error: categoriesError } = await supabaseClient
                .from('categories')
                .select('name')
                .order('name');
            
            if (categoriesError) {
                if (categoriesError.code !== '42P01') {
                    throw categoriesError;
                }
                console.log('⚠️ جدول التصنيفات غير موجود - سيتم استخدام التصنيفات من المنتجات');
                categories = [...new Set(products.map(p => p.category))].filter(c => c);
            } else {
                const dbCategories = categoriesData.map(c => c.name);
                const productCategories = [...new Set(products.map(p => p.category))].filter(c => c);
                categories = [...new Set([...dbCategories, ...productCategories])];
            }
        } catch (catError) {
            console.log('⚠️ خطأ في تحميل التصنيفات:', catError.message);
            categories = [...new Set(products.map(p => p.category))].filter(c => c);
        }
        
        console.log('✅ تم تحميل التصنيفات:', categories);
        
        displayProducts();
        updateCategoryFilters();
        
        if (isAdminLoggedIn) {
            adminSearchProducts();
            displayOrders();
            updateOrderContacts();
            updateCategorySelects();
            displayCategories();
        }
        
    } catch (error) {
        console.error('❌ خطأ في تحميل البيانات:', error);
        showToast('خطأ', 'فشل تحميل البيانات من قاعدة البيانات', 'error');
    }
}

function loadSupabaseSettings() {
    document.getElementById('supabaseUrl').value = SUPABASE_URL;
    document.getElementById('supabaseKey').value = SUPABASE_KEY;
}

async function saveSupabaseSettings() {
    const url = document.getElementById('supabaseUrl').value.trim();
    const key = document.getElementById('supabaseKey').value.trim();
    
    if (!url || !key) {
        showToast('خطأ', 'الرجاء إدخال بيانات Supabase', 'error');
        return;
    }
    
    localStorage.setItem('supabaseUrl', url);
    localStorage.setItem('supabaseKey', key);
    
    SUPABASE_URL = url;
    SUPABASE_KEY = key;
    
    const success = await initSupabase();
    if (success) {
        showToast('نجاح', 'تم حفظ إعدادات Supabase بنجاح', 'success');
        await loadDataFromSupabase();
    } else {
        showToast('خطأ', 'فشل الاتصال بـ Supabase. تحقق من البيانات', 'error');
    }
}

async function testSupabaseConnection() {
    const url = document.getElementById('supabaseUrl').value.trim();
    const key = document.getElementById('supabaseKey').value.trim();
    
    if (!url || !key) {
        showToast('خطأ', 'الرجاء إدخال بيانات Supabase', 'error');
        return;
    }
    
    try {
        const tempSupabase = window.supabase.createClient(url, key);
        const { data, error } = await tempSupabase.from('products').select('count');
        
        if (error) {
            showToast('خطأ', 'فشل الاتصال: ' + error.message, 'error');
        } else {
            showToast('نجاح', 'تم الاتصال بـ Supabase بنجاح ✓', 'success');
        }
        
    } catch (error) {
        showToast('خطأ', 'خطأ في الاتصال: ' + error.message, 'error');
    }
}

// ==================== الإشعارات ====================
function showToast(title, message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastTitle = document.getElementById('toastTitle');
    const toastMessage = document.getElementById('toastMessage');
    const toastIcon = toast.querySelector('.toast-icon i');
    
    toastTitle.textContent = title;
    toastMessage.textContent = message;
    
    toast.className = `toast ${type}`;
    
    const icons = {
        'success': 'fa-check',
        'error': 'fa-exclamation-circle',
        'warning': 'fa-exclamation-triangle',
        'info': 'fa-info-circle'
    };
    
    toastIcon.className = `fas ${icons[type] || icons.success}`;
    
    toast.classList.add('show');
    
    setTimeout(() => {
        hideToast();
    }, 5000);
}

function hideToast() {
    document.getElementById('toast').classList.remove('show');
}

// ==================== تهيئة التطبيق ====================
window.onload = async function() {
    console.log("🚀 بدء تحميل التطبيق...");
    updateCartCount();
    hideToast();
    loadSupabaseSettings();
    
    const connected = await initSupabase();
    if (connected) {
        await loadDataFromSupabase();
    } else {
        console.log('⚠️ التطبيق يعمل بدون اتصال بـ Supabase');
        showToast('تنبيه', 'يرجى إعداد اتصال Supabase في الإعدادات', 'warning');
    }
    
    updateAdminPhoneDisplay();
    showStore();
    console.log("✅ تم تحميل التطبيق بنجاح");
};

// ==================== أحداث ====================
document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                searchProducts();
            }
        });
    }
    
    const adminSearchInput = document.getElementById('adminSearchInput');
    if (adminSearchInput) {
        adminSearchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                adminSearchProducts();
            }
        });
    }
});