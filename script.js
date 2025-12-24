// ==================== المتغيرات العالمية ====================
let supabaseClient = null;
let SUPABASE_URL = 'https://uljvprdjdqvvyenbxxpv.supabase.co';
let SUPABASE_KEY = 'sb_publishable_m7pZYKZgy3-LQeV26og_hg_iezPuo8U';
const ADMIN_PASSWORD = 'Samir012700@';
let isAdminLoggedIn = false;
let currentFilter = 'all';
let products = [];
let categories = [];
let orders = [];
let cart = JSON.parse(localStorage.getItem('cart')) || [];

// متغيرات رفع الصور
let selectedImageFile = null;
let selectedImageDataURL = null;

// ==================== دوال رفع الصور ====================
async function compressImage(file, maxSizeKB = 500, maxWidth = 800, maxHeight = 800) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width *= ratio;
                    height *= ratio;
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                let quality = 0.9;
                const compress = () => {
                    const dataURL = canvas.toDataURL('image/jpeg', quality);
                    const sizeKB = Math.round((dataURL.length * 3 / 4) / 1024);
                    
                    if (sizeKB > maxSizeKB && quality > 0.1) {
                        quality -= 0.1;
                        compress();
                    } else {
                        resolve({ dataURL, sizeKB });
                    }
                };
                compress();
            };
            img.onerror = () => reject(new Error('فشل تحميل الصورة'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('فشل قراءة الملف'));
        reader.readAsDataURL(file);
    });
}

async function handleImageSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        showToast('خطأ', 'الرجاء اختيار صورة صالحة', 'error');
        return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
        showToast('خطأ', 'حجم الصورة كبير جداً (أكثر من 10 MB)', 'error');
        return;
    }
    
    try {
        showToast('جاري المعالجة', 'جاري ضغط الصورة...', 'info');
        const compressed = await compressImage(file);
        
        selectedImageFile = file;
        selectedImageDataURL = compressed.dataURL;
        
        const preview = document.getElementById('imagePreview');
        preview.innerHTML = `<img src="${compressed.dataURL}" alt="معاينة">`;
        
        document.getElementById('removeImageBtn').style.display = 'inline-flex';
        showToast('نجاح', `تم ضغط الصورة إلى ${compressed.sizeKB} KB`, 'success');
    } catch (error) {
        console.error('❌ خطأ في معالجة الصورة:', error);
        showToast('خطأ', 'فشلت معالجة الصورة', 'error');
    }
}

function removeProductImage() {
    selectedImageFile = null;
    selectedImageDataURL = null;
    
    const preview = document.getElementById('imagePreview');
    preview.innerHTML = '<i class="fas fa-cloud-upload-alt"></i><p>انقر أو اسحب الصورة هنا</p><small>أقصى حجم: 10 MB</small>';
    
    document.getElementById('productImage').value = '';
    document.getElementById('removeImageBtn').style.display = 'none';
    document.getElementById('currentImageUrl').value = '';
    showToast('تم الحذف', 'تم حذف الصورة', 'success');
}

async function uploadImageToSupabase(file, dataURL) {
    if (!supabaseClient) throw new Error('لا يوجد اتصال بـ Supabase');
    
    try {
        console.log('🚀 بدء رفع الصورة...');
        
        const response = await fetch(dataURL);
        const blob = await response.blob();
        
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(7);
        const fileExt = file.name.split('.').pop().toLowerCase();
        const fileName = `product_${timestamp}_${randomStr}.${fileExt}`;
        
        console.log('📤 اسم الملف:', fileName);
        console.log('📊 حجم الصورة:', Math.round(blob.size / 1024), 'KB');
        
        document.getElementById('uploadProgress').style.display = 'block';
        updateProgress(30);
        
        const { data, error } = await supabaseClient
            .storage
            .from('product-images')
            .upload(fileName, blob, {
                contentType: blob.type,
                cacheControl: '3600',
                upsert: false
            });
        
        if (error) {
            console.error('❌ خطأ في رفع الصورة:', error);
            throw error;
        }
        
        console.log('✅ تم رفع الصورة:', data);
        updateProgress(70);
        
        const { data: urlData } = supabaseClient
            .storage
            .from('product-images')
            .getPublicUrl(fileName);
        
        const publicUrl = urlData.publicUrl;
        
        console.log('🔗 الرابط العام:', publicUrl);
        
        const imgTest = await testImageUrl(publicUrl);
        console.log('🧪 اختبار الصورة:', imgTest ? '✅ ناجح' : '❌ فاشل');
        
        updateProgress(100);
        
        setTimeout(() => {
            document.getElementById('uploadProgress').style.display = 'none';
        }, 1000);
        
        return publicUrl;
    } catch (error) {
        console.error('❌ خطأ في uploadImageToSupabase:', error);
        document.getElementById('uploadProgress').style.display = 'none';
        
        if (error.message.includes('row-level security') || error.message.includes('permission')) {
            throw new Error('خطأ في الصلاحيات. تأكد من تشغيل SQL لإصلاح صلاحيات Storage');
        } else if (error.message.includes('Bucket not found')) {
            throw new Error('الـ bucket غير موجود. أنشئ bucket باسم "product-images"');
        } else if (error.message.includes('JWT')) {
            throw new Error('خطأ في المصادقة. تأكد من صحة مفتاح Supabase');
        }
        throw error;
    }
}

async function deleteImageFromSupabase(imageUrl) {
    if (!imageUrl || !supabaseClient) return;
    
    try {
        const urlParts = imageUrl.split('/storage/v1/object/public/product-images/');
        if (urlParts.length < 2) return;
        
        const fileName = urlParts[1].split('?')[0];
        if (!fileName || fileName === 'undefined') return;
        
        console.log('🗑️ جاري حذف الصورة:', fileName);
        const { error } = await supabaseClient
            .storage
            .from('product-images')
            .remove([fileName]);
        
        if (error) {
            console.error('⚠️ خطأ في حذف الصورة:', error);
        } else {
            console.log('✅ تم حذف الصورة بنجاح');
        }
    } catch (error) {
        console.error('⚠️ خطأ في حذف الصورة:', error);
    }
}

function updateProgress(percent) {
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    if (progressFill && progressText) {
        progressFill.style.width = percent + '%';
        progressText.textContent = `جاري الرفع... ${percent}%`;
        if (percent === 100) {
            progressText.textContent = 'تم الرفع بنجاح ✓';
        }
    }
}

async function testImageUrl(url) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            console.log('✅ الصورة تحمّلت بنجاح:', url);
            resolve(true);
        };
        img.onerror = () => {
            console.error('❌ فشل تحميل الصورة:', url);
            resolve(false);
        };
        img.src = url;
        setTimeout(() => resolve(false), 5000);
    });
}

// ==================== دوال النوافذ المنبثقة ====================
function openAdminLoginModal() { document.getElementById('adminLoginModal').classList.add('active'); }
function closeAdminLoginModal() { document.getElementById('adminLoginModal').classList.remove('active'); }
function openCartModal() { updateCartDisplay(); document.getElementById('cartModal').classList.add('active'); }
function closeCartModal() { document.getElementById('cartModal').classList.remove('active'); }
function openOrderSuccessModal() { document.getElementById('orderSuccessModal').classList.add('active'); }
function closeOrderSuccessModal() { document.getElementById('orderSuccessModal').classList.remove('active'); showStore(); }

// ==================== عرض الصورة بحجم كامل ====================
function openImageModal(imageSrc) {
    const modal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    modalImage.src = imageSrc;
    modal.classList.add('active');
}

function closeImageModal() {
    const modal = document.getElementById('imageModal');
    modal.classList.remove('active');
}

// إغلاق النافذة عند النقر خارج الصورة
document.addEventListener('DOMContentLoaded', function() {
    const imageModal = document.getElementById('imageModal');
    if (imageModal) {
        imageModal.addEventListener('click', function(e) {
            if (e.target === imageModal) {
                closeImageModal();
            }
        });
    }
});

// ==================== إدارة السلة ====================
function updateCartCount() {
    const totalItems = cart.reduce((total, item) => total + item.quantity, 0);
    document.getElementById('cartCount').textContent = totalItems;
}

function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product || product.quantity === 0) {
        showToast('خطأ', 'المنتج غير متوفر', 'error');
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
                <div style="font-weight: 700; color: var(--secondary); min-width: 80px; text-align: left;">${itemTotal.toFixed(2)} ج.م</div>
                <button class="quantity-btn" style="border-color: var(--danger); color: var(--danger);" onclick="removeFromCart(${item.productId})"><i class="fas fa-trash"></i></button>
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

function saveCart() { localStorage.setItem('cart', JSON.stringify(cart)); }
function clearCart() { cart = []; updateCartCount(); saveCart(); }

// ==================== إدارة المتجر ====================
function showStore() {
    document.getElementById('publicContainer').style.display = 'block';
    document.getElementById('adminContainer').style.display = 'none';
    displayProducts();
}

function showAdminDashboard() {
    document.getElementById('publicContainer').style.display = 'none';
    document.getElementById('adminContainer').style.display = 'block';
    if (isAdminLoggedIn) showAdminPage('orders');
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
        let imageHtml = '';
        
        if (product.image_url && product.image_url.trim() !== '' && product.image_url !== 'null') {
            const imageUrl = product.image_url.includes('?') 
                ? product.image_url 
                : product.image_url + '?v=' + Date.now();
                
            console.log('🖼️ عرض صورة المنتج:', product.name, imageUrl);
            
            imageHtml = `
                <img src="${imageUrl}" 
                     alt="${product.name}" 
                     style="width: 100%; height: 100%; object-fit: cover; cursor: zoom-in;"
                     loading="lazy"
                     onclick="openImageModal('${imageUrl}')"
                     onerror="console.error('❌ فشل تحميل الصورة:', '${imageUrl}'); this.onerror=null; this.style.display='none'; this.parentElement.innerHTML='<div style=\\'width:100%;height:100%;background:linear-gradient(135deg,#f0f0f0,#e0e0e0);display:flex;align-items:center;justify-content:center\\'><i class=\\'fas fa-image\\' style=\\'font-size:4em;color:#ccc\\'></i></div>';">
            `;
        } else {
            imageHtml = `
                <div style="width: 100%; height: 100%; background: linear-gradient(135deg, #f0f0f0, #e0e0e0); display: flex; align-items: center; justify-content: center;">
                    <i class="fas fa-box" style="font-size: 4em; color: #ccc;"></i>
                </div>
            `;
        }
        
        return `
            <div class="product-card">
                <div class="product-image">
                    ${imageHtml}
                    <span class="product-badge category-badge">${product.category}</span>
                    <span class="status-badge in-stock">متوفر</span>
                </div>
                <div class="product-info">
                    <div class="product-name">${product.name}</div>
                    <div class="product-desc">${product.description || 'لا يوجد وصف'}</div>
                    <div class="product-details">
                        <div class="product-price">${product.price} ج.م</div>
                        <div class="product-quantity"><i class="fas fa-layer-group"></i> ${product.quantity}</div>
                    </div>
                    <div class="product-actions">
                        <button class="btn btn-primary" onclick="addToCart(${product.id})">
                            <i class="fas fa-shopping-cart"></i> أضف إلى السلة
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function searchProducts() { displayProducts(); }

function updateCategoryFilters() {
    const container = document.getElementById('categoryFilters');
    const filterButtons = categories.map(cat => {
        const count = products.filter(p => p.category === cat && p.status === 'available' && p.quantity > 0).length;
        if (count === 0) return '';
        return `<button class="category-filter-btn ${currentFilter === cat ? 'active' : ''}" onclick="filterByCategory('${cat}')">${cat} (${count})</button>`;
    }).join('');
    
    const allCount = products.filter(p => p.status === 'available' && p.quantity > 0).length;
    container.innerHTML = `<button class="category-filter-btn ${currentFilter === 'all' ? 'active' : ''}" onclick="filterByCategory('all')">الكل (${allCount})</button>${filterButtons}`;
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
    
    if (!customerPhone || cart.length === 0) {
        showToast('خطأ', 'الرجاء إدخال رقم الهاتف', 'error');
        return;
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
        
        const { data: newOrder, error } = await supabaseClient.from('orders').insert([orderData]).select();
        if (error) throw error;
        
        for (const cartItem of cart) {
            const product = products.find(p => p.id === cartItem.productId);
            const newQuantity = product.quantity - cartItem.quantity;
            await supabaseClient.from('products').update({ 
                quantity: newQuantity,
                status: newQuantity > 0 ? 'available' : 'unavailable'
            }).eq('id', cartItem.productId);
        }
        
        document.getElementById('orderNumber').textContent = `#${newOrder[0].id}`;
        closeCartModal();
        setTimeout(() => openOrderSuccessModal(), 300);
        clearCart();
        await loadDataFromSupabase();
        showToast('تم الطلب', `تم استلام طلبك برقم #${newOrder[0].id}`, 'success');
    } catch (error) {
        showToast('خطأ', 'فشل حفظ الطلب: ' + error.message, 'error');
    }
}

function displayOrders() {
    const container = document.getElementById('ordersContainer');
    if (orders.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-clipboard-list" style="font-size: 3em;"></i><h3>لا توجد طلبات</h3></div>';
        return;
    }
    
    container.innerHTML = [...orders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map(order => {
        const statusColors = { 'pending': 'status-pending', 'processing': 'status-processing', 'completed': 'status-completed' };
        const statusTexts = { 'pending': 'قيد الانتظار', 'processing': 'قيد التجهيز', 'completed': 'مكتمل' };
        const date = new Date(order.created_at).toLocaleString('ar-EG');
        return `
            <div class="order-card">
                <div class="order-header">
                    <div class="order-number">طلب #${order.id}</div>
                    <div class="order-status ${statusColors[order.status]}">${statusTexts[order.status]}</div>
                </div>
                <div class="order-customer">
                    <i class="fas fa-user" style="font-size: 1.5em; color: var(--info);"></i>
                    <div class="customer-info">
                        <h4>${order.customer_name}</h4>
                        <p>
                            <i class="fas fa-phone"></i> ${order.customer_phone}
                            <button style="border: none; background: none; color: var(--info); cursor:pointer;" onclick="copyPhoneNumber('${order.customer_phone}')"><i class="fas fa-copy"></i></button>
                            <a href="https://wa.me/2${order.customer_phone.replace(/^0/, '')}" target="_blank" style="color: var(--success); text-decoration:none;"><i class="fab fa-whatsapp"></i></a>
                        </p>
                        <p style="font-size:0.85em;color:#999;margin-top:5px;"><i class="fas fa-clock"></i> ${date}</p>
                    </div>
                </div>
                <div class="order-items">
                    ${Array.isArray(order.items) ? order.items.map(item => `
                        <div class="order-item">
                            <span class="item-name">${item.name}</span>
                            <span class="item-quantity">${item.quantity}×</span>
                            <span class="item-price">${(item.price * item.quantity).toFixed(2)} ج.م</span>
                        </div>
                    `).join('') : ''}
                </div>
                <div class="order-total">
                    <span class="total-label">الإجمالي:</span>
                    <span class="total-amount">${order.total.toFixed(2)} ج.م</span>
                </div>
                ${order.notes ? `<div style="background: #f8fafc; padding: 12px; border-radius: 8px; margin: 12px 0;"><p style="font-weight: 600; margin-bottom: 5px;">ملاحظات:</p><p style="color: #666;">${order.notes}</p></div>` : ''}
                <div class="order-actions">
                    <button class="btn btn-primary" onclick="updateOrderStatus(${order.id}, 'processing')" ${order.status !== 'pending' ? 'disabled' : ''}><i class="fas fa-cogs"></i> تجهيز</button>
                    <button class="btn btn-success" onclick="updateOrderStatus(${order.id}, 'completed')" ${order.status === 'completed' ? 'disabled' : ''}><i class="fas fa-check"></i> إكمال</button>
                    <button class="btn btn-danger" onclick="deleteOrder(${order.id})"><i class="fas fa-trash"></i> حذف</button>
                </div>
            </div>
        `;
    }).join('');
}

async function updateOrderStatus(orderId, newStatus) {
    try {
        await supabaseClient.from('orders').update({ status: newStatus }).eq('id', orderId);
        await loadDataFromSupabase();
        showToast('تم التحديث', 'تم تحديث حالة الطلب', 'success');
    } catch (error) {
        showToast('خطأ', 'فشل التحديث', 'error');
    }
}

async function deleteOrder(orderId) {
    if (!confirm('هل أنت متأكد من حذف هذا الطلب؟')) return;
    try {
        await supabaseClient.from('orders').delete().eq('id', orderId);
        await loadDataFromSupabase();
        showToast('تم الحذف', 'تم حذف الطلب بنجاح', 'success');
    } catch (error) {
        showToast('خطأ', 'فشل الحذف', 'error');
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
            <i class="fas fa-phone"></i><span>${phone}</span>
            <button style="border: none; background: none; color: white; cursor:pointer;" onclick="copyPhoneNumber('${phone}')"><i class="fas fa-copy"></i></button>
            <a href="https://wa.me/2${phone.replace(/^0/, '')}" target="_blank" style="color: white; text-decoration:none;"><i class="fab fa-whatsapp"></i></a>
        </div>
    `).join('');
}

function copyPhoneNumber(phone) {
    navigator.clipboard.writeText(phone).then(() => showToast('تم النسخ', `تم نسخ الرقم: ${phone}`, 'success'));
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
        document.getElementById('adminPhoneNumber').textContent = adminPhone;
    }
    
    closeAdminLoginModal();
    showAdminDashboard();
    showToast('مرحباً', 'تم تسجيل الدخول بنجاح', 'success');
}

function logoutAdmin() {
    if (confirm('هل تريد تسجيل الخروج؟')) {
        isAdminLoggedIn = false;
        showStore();
        showToast('تم الخروج', 'تم تسجيل الخروج بنجاح', 'success');
    }
}

function showAdminPage(page, clickedElement) {
    console.log('🔄 التبديل إلى صفحة:', page);
    
    document.querySelectorAll('.admin-page').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
    
    const pageElement = document.getElementById(page + 'Page');
    if (pageElement) {
        pageElement.classList.add('active');
        console.log('✅ تم إظهار صفحة:', page);
    }
    
    if (clickedElement) {
        clickedElement.classList.add('active');
    } else {
        const tabs = document.querySelectorAll('.nav-tab');
        tabs.forEach(tab => {
            const tabOnClick = tab.getAttribute('onclick');
            if (tabOnClick && tabOnClick.includes(`'${page}'`)) {
                tab.classList.add('active');
            }
        });
    }
    
    switch(page) {
        case 'orders': 
            displayOrders(); 
            updateOrderContacts(); 
            break;
        case 'products': 
            currentFilter = 'all';
            adminSearchProducts(); 
            updateAdminCategoryFilters(); 
            break;
        case 'add-product': 
            updateCategorySelects(); 
            break;
        case 'categories': 
            displayCategories(); 
            break;
        case 'settings': 
            loadSupabaseSettings(); 
            break;
        case 'reports':
            displayReports();
            break;
    }
}

// ==================== إدارة المنتجات ====================
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
            (p.description && p.description.toLowerCase().includes(searchTerm))
        );
    }
    
    if (filteredProducts.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-search" style="font-size: 3em;"></i><h3>لا توجد منتجات</h3></div>';
        return;
    }
    
    container.innerHTML = filteredProducts.map(product => {
        let imageHtml = '';
        
        if (product.image_url && product.image_url.trim() !== '' && product.image_url !== 'null') {
            const imageUrl = product.image_url.includes('?') 
                ? product.image_url 
                : product.image_url + '?v=' + Date.now();
                
            imageHtml = `
                <img src="${imageUrl}" 
                     alt="${product.name}" 
                     style="width: 100%; height: 100%; object-fit: cover; cursor: zoom-in;"
                     loading="lazy"
                     onclick="openImageModal('${imageUrl}')"
                     onerror="this.onerror=null; this.style.display='none'; this.parentElement.innerHTML='<div style=\\'width:100%;height:100%;background:linear-gradient(135deg,#f0f0f0,#e0e0e0);display:flex;align-items:center;justify-content:center\\'><i class=\\'fas fa-image\\' style=\\'font-size:4em;color:#ccc\\'></i></div>';">
            `;
        } else {
            imageHtml = `
                <div style="width: 100%; height: 100%; background: linear-gradient(135deg, #f0f0f0, #e0e0e0); display: flex; align-items: center; justify-content: center;">
                    <i class="fas fa-box" style="font-size: 4em; color: #ccc;"></i>
                </div>
            `;
        }
        
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
                        <div class="product-quantity"><i class="fas fa-layer-group"></i> ${product.quantity}</div>
                    </div>
                    <div class="product-actions">
                        <button class="btn btn-primary" onclick="editProduct(${product.id})"><i class="fas fa-edit"></i> تعديل</button>
                        <button class="btn btn-danger" onclick="deleteProduct(${product.id})"><i class="fas fa-trash"></i> حذف</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function updateAdminCategoryFilters() {
    const container = document.getElementById('adminCategoryFilters');
    if (!container) return;
    
    const filterButtons = categories.map(cat => {
        const count = products.filter(p => p.category === cat).length;
        return `<button class="category-filter-btn ${currentFilter === cat ? 'active' : ''}" onclick="adminFilterByCategory('${cat}')">${cat} (${count})</button>`;
    }).join('');
    
    container.innerHTML = `<button class="category-filter-btn ${currentFilter === 'all' ? 'active' : ''}" onclick="adminFilterByCategory('all')">الكل (${products.length})</button>${filterButtons}`;
}

function adminFilterByCategory(category) {
    currentFilter = category;
    updateAdminCategoryFilters();
    adminSearchProducts();
}

async function saveProduct(event) {
    event.preventDefault();
    
    const id = document.getElementById('productId').value;
    const name = document.getElementById('productName').value.trim();
    const category = document.getElementById('productCategory').value;
    const price = parseFloat(document.getElementById('productPrice').value);
    const quantity = parseInt(document.getElementById('productQuantity').value);
    const status = document.getElementById('productStatus').value;
    const description = document.getElementById('productDescription').value.trim();
    let imageUrl = document.getElementById('currentImageUrl').value;
    
    if (!name || !category || isNaN(price) || isNaN(quantity)) {
        showToast('خطأ', 'الرجاء ملء جميع الحقول المطلوبة', 'error');
        return;
    }
    
    if (!supabaseClient) {
        showToast('خطأ', 'لا يوجد اتصال بقاعدة البيانات', 'error');
        return;
    }
    
    try {
        if (selectedImageFile && selectedImageDataURL) {
            console.log('🚀 بدء رفع صورة جديدة...');
            showToast('جاري الرفع', 'جاري رفع الصورة...', 'info');
            
            if (imageUrl && imageUrl !== 'null') {
                await deleteImageFromSupabase(imageUrl);
            }
            
            imageUrl = await uploadImageToSupabase(selectedImageFile, selectedImageDataURL);
            console.log('✅ رابط الصورة الجديد:', imageUrl);
            
            const testResult = await testImageUrl(imageUrl);
            console.log('🧪 نتيجة اختبار الصورة:', testResult ? '✅ ناجح' : '❌ فاشل');
        }
        
        const productData = {
            name, 
            category, 
            price, 
            quantity,
            status: quantity > 0 ? status : 'unavailable',
            description, 
            image_url: imageUrl || null
        };
        
        console.log('📦 بيانات المنتج:', productData);
        
        let result;
        if (id) {
            result = await supabaseClient
                .from('products')
                .update(productData)
                .eq('id', id)
                .select();
                
            if (result.error) throw result.error;
            console.log('✅ تم تحديث المنتج');
            showToast('نجاح', 'تم تحديث المنتج بنجاح!', 'success');
        } else {
            result = await supabaseClient
                .from('products')
                .insert([productData])
                .select();
                
            if (result.error) throw result.error;
            console.log('✅ تم إضافة المنتج');
            showToast('نجاح', 'تم إضافة المنتج بنجاح!', 'success');
        }
        
        selectedImageFile = null;
        selectedImageDataURL = null;
        
        await loadDataFromSupabase();
        setTimeout(() => showAdminPage('products'), 1500);
        
    } catch (error) {
        console.error('❌ خطأ في حفظ المنتج:', error);
        showToast('خطأ', 'فشل حفظ المنتج: ' + error.message, 'error');
    }
}

function editProduct(id) {
    console.log('✏️ تعديل المنتج رقم:', id);
    
    const product = products.find(p => p.id == id);
    if (!product) {
        showToast('خطأ', 'المنتج غير موجود', 'error');
        return;
    }
    
    document.getElementById('productId').value = product.id;
    document.getElementById('productName').value = product.name;
    document.getElementById('productCategory').value = product.category;
    document.getElementById('productPrice').value = product.price;
    document.getElementById('productQuantity').value = product.quantity;
    document.getElementById('productStatus').value = product.status;
    document.getElementById('productDescription').value = product.description || '';
    
    if (product.image_url && product.image_url.trim() !== '' && product.image_url !== 'null') {
        const preview = document.getElementById('imagePreview');
        preview.innerHTML = `<img src="${product.image_url}" alt="${product.name}" style="max-width: 100%; max-height: 100%; object-fit: contain;">`;
        document.getElementById('currentImageUrl').value = product.image_url;
        document.getElementById('removeImageBtn').style.display = 'inline-flex';
    } else {
        const preview = document.getElementById('imagePreview');
        preview.innerHTML = '<i class="fas fa-cloud-upload-alt"></i><p>انقر أو اسحب الصورة هنا</p><small>أقصى حجم: 10 MB</small>';
        document.getElementById('currentImageUrl').value = '';
        document.getElementById('removeImageBtn').style.display = 'none';
    }
    
    document.getElementById('productFormTitle').innerHTML = '<i class="fas fa-edit"></i> تعديل المنتج';
    document.getElementById('productSubmitBtn').innerHTML = '<i class="fas fa-save"></i> حفظ التغييرات';
    
    showAdminPage('add-product');
    
    console.log('✅ تم تحميل بيانات المنتج للتعديل');
}

async function deleteProduct(id) {
    if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) return;
    
    try {
        const product = products.find(p => p.id === id);
        if (product && product.image_url && product.image_url !== 'null') {
            await deleteImageFromSupabase(product.image_url);
        }
        
        await supabaseClient.from('products').delete().eq('id', id);
        await loadDataFromSupabase();
        showToast('نجاح', 'تم حذف المنتج بنجاح', 'success');
    } catch (error) {
        showToast('خطأ', 'فشل حذف المنتج', 'error');
    }
}

function resetProductForm() {
    document.getElementById('productForm').reset();
    document.getElementById('productId').value = '';
    document.getElementById('currentImageUrl').value = '';
    removeProductImage();
    document.getElementById('productFormTitle').innerHTML = '<i class="fas fa-plus-square"></i> إضافة منتج جديد';
    document.getElementById('productSubmitBtn').innerHTML = '<i class="fas fa-save"></i> حفظ المنتج';
    updateCategorySelects();
}

function updateCategorySelects() {
    const select = document.getElementById('productCategory');
    if (!select) return;
    select.innerHTML = '<option value="">اختر التصنيف</option>' + 
        categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
}

// ==================== إدارة التصنيفات ====================
function displayCategories() {
    const container = document.getElementById('categoriesList');
    if (!container) return;
    
    if (categories.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #999; padding: 30px;">لا توجد تصنيفات حالياً</p>';
        return;
    }
    
    container.innerHTML = categories.map(category => {
        const count = products.filter(p => p.category === category).length;
        return `
            <div style="background: linear-gradient(135deg, var(--info), #2563eb); color: white; padding: 14px 22px; border-radius: 50px; display: flex; align-items: center; gap: 12px;">
                <span style="font-weight:700">${category}</span>
                <span style="background: rgba(255,255,255,0.3); padding: 4px 12px; border-radius: 20px; font-size:0.9em;">${count}</span>
                <div style="display: flex; gap: 8px; margin-right:auto;">
                    <button onclick="editCategory('${category}')" style="background: rgba(255,255,255,0.25); border: none; color: white; width: 32px; height: 32px; border-radius: 50%; cursor: pointer;"><i class="fas fa-edit"></i></button>
                    <button onclick="deleteCategory('${category}')" style="background: rgba(255,255,255,0.25); border: none; color: white; width: 32px; height: 32px; border-radius: 50%; cursor: pointer;"><i class="fas fa-trash"></i></button>
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
    
    try {
        if (categoryId) {
            if (categories.includes(categoryName) && categoryName !== categoryId) {
                showToast('خطأ', 'هذا التصنيف موجود بالفعل!', 'error');
                return;
            }
            await supabaseClient.from('products').update({ category: categoryName }).eq('category', categoryId);
            showToast('نجاح', 'تم تحديث التصنيف بنجاح', 'success');
        } else {
            if (categories.includes(categoryName)) {
                showToast('خطأ', 'هذا التصنيف موجود بالفعل!', 'error');
                return;
            }
            categories.push(categoryName);
            localStorage.setItem('categories', JSON.stringify(categories));
            showToast('نجاح', 'تم إضافة التصنيف بنجاح', 'success');
        }
        
        resetCategoryForm();
        displayCategories();
        updateCategorySelects();
    } catch (error) {
        showToast('خطأ', 'فشل حفظ التصنيف', 'error');
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
    
    if (confirm(`هل أنت متأكد من حذف تصنيف "${categoryName}"؟`)) {
        categories = categories.filter(c => c !== categoryName);
        localStorage.setItem('categories', JSON.stringify(categories));
        displayCategories();
        updateCategorySelects();
        showToast('نجاح', 'تم حذف التصنيف بنجاح', 'success');
    }
}

function resetCategoryForm() {
    document.getElementById('categoryForm').reset();
    document.getElementById('categoryId').value = '';
    document.getElementById('categorySubmitBtn').innerHTML = '<i class="fas fa-plus"></i> إضافة';
}

// ==================== التقارير ====================
function displayReports() {
    console.log('📊 عرض التقارير...');
    
    const totalProducts = products.length;
    const availableProducts = products.filter(p => p.status === 'available').length;
    const outOfStock = products.filter(p => p.quantity === 0).length;
    const totalInventoryValue = products.reduce((sum, p) => sum + (p.price * p.quantity), 0);
    
    const totalOrders = orders.length;
    const pendingOrders = orders.filter(o => o.status === 'pending').length;
    const processingOrders = orders.filter(o => o.status === 'processing').length;
    const completedOrders = orders.filter(o => o.status === 'completed').length;
    const totalRevenue = orders.filter(o => o.status === 'completed').reduce((sum, o) => sum + o.total, 0);
    const expectedRevenue = orders.filter(o => o.status !== 'completed').reduce((sum, o) => sum + o.total, 0);
    
    const productSales = {};
    orders.forEach(order => {
        if (Array.isArray(order.items)) {
            order.items.forEach(item => {
                if (productSales[item.name]) {
                    productSales[item.name] += item.quantity;
                } else {
                    productSales[item.name] = item.quantity;
                }
            });
        }
    });
    const topProducts = Object.entries(productSales)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    
    const categorySales = {};
    orders.forEach(order => {
        if (Array.isArray(order.items)) {
            order.items.forEach(item => {
                const product = products.find(p => p.name === item.name);
                if (product) {
                    const cat = product.category;
                    if (categorySales[cat]) {
                        categorySales[cat] += item.quantity;
                    } else {
                        categorySales[cat] = item.quantity;
                    }
                }
            });
        }
    });
    
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toLocaleDateString('ar-EG');
        const dayOrders = orders.filter(o => {
            const orderDate = new Date(o.created_at).toLocaleDateString('ar-EG');
            return orderDate === dateStr;
        });
        last7Days.push({ date: dateStr, count: dayOrders.length, revenue: dayOrders.reduce((sum, o) => sum + o.total, 0) });
    }
    
    const reportsHTML = `
        <div class="stats-grid">
            <div class="stat-card stat-primary">
                <div class="stat-icon"><i class="fas fa-shopping-cart"></i></div>
                <div class="stat-info">
                    <h3>${totalOrders}</h3>
                    <p>إجمالي الطلبات</p>
                </div>
            </div>
            
            <div class="stat-card stat-warning">
                <div class="stat-icon"><i class="fas fa-clock"></i></div>
                <div class="stat-info">
                    <h3>${pendingOrders}</h3>
                    <p>طلبات معلقة</p>
                </div>
            </div>
            
            <div class="stat-card stat-info">
                <div class="stat-icon"><i class="fas fa-cogs"></i></div>
                <div class="stat-info">
                    <h3>${processingOrders}</h3>
                    <p>قيد التجهيز</p>
                </div>
            </div>
            
            <div class="stat-card stat-success">
                <div class="stat-icon"><i class="fas fa-check-circle"></i></div>
                <div class="stat-info">
                    <h3>${completedOrders}</h3>
                    <p>طلبات مكتملة</p>
                </div>
            </div>
            
            <div class="stat-card stat-money">
                <div class="stat-icon"><i class="fas fa-coins"></i></div>
                <div class="stat-info">
                    <h3>${totalRevenue.toFixed(2)} ج.م</h3>
                    <p>إجمالي الإيرادات</p>
                </div>
            </div>
            
            <div class="stat-card stat-pending-money">
                <div class="stat-icon"><i class="fas fa-hourglass-half"></i></div>
                <div class="stat-info">
                    <h3>${expectedRevenue.toFixed(2)} ج.م</h3>
                    <p>إيرادات متوقعة</p>
                </div>
            </div>
            
            <div class="stat-card stat-products">
                <div class="stat-icon"><i class="fas fa-boxes"></i></div>
                <div class="stat-info">
                    <h3>${totalProducts}</h3>
                    <p>إجمالي المنتجات</p>
                </div>
            </div>
            
            <div class="stat-card stat-danger">
                <div class="stat-icon"><i class="fas fa-exclamation-triangle"></i></div>
                <div class="stat-info">
                    <h3>${outOfStock}</h3>
                    <p>منتجات نفذت</p>
                </div>
            </div>
        </div>
        
        <div class="reports-grid">
            <div class="report-card">
                <h3><i class="fas fa-star"></i> أكثر المنتجات مبيعاً</h3>
                <div class="top-products">
                    ${topProducts.length > 0 ? topProducts.map((item, index) => `
                        <div class="top-product-item">
                            <span class="rank">#${index + 1}</span>
                            <span class="product-name">${item[0]}</span>
                            <span class="sales-count">${item[1]} قطعة</span>
                        </div>
                    `).join('') : '<p class="no-data">لا توجد مبيعات بعد</p>'}
                </div>
            </div>
            
            <div class="report-card">
                <h3><i class="fas fa-chart-pie"></i> المبيعات حسب التصنيف</h3>
                <div class="category-sales">
                    ${Object.entries(categorySales).length > 0 ? Object.entries(categorySales).map(([cat, count]) => `
                        <div class="category-sale-item">
                            <span class="category-name">${cat}</span>
                            <div class="sale-bar-container">
                                <div class="sale-bar" style="width: ${(count / Math.max(...Object.values(categorySales))) * 100}%"></div>
                            </div>
                            <span class="sale-count">${count}</span>
                        </div>
                    `).join('') : '<p class="no-data">لا توجد مبيعات بعد</p>'}
                </div>
            </div>
            
            <div class="report-card full-width">
                <h3><i class="fas fa-chart-line"></i> الطلبات خلال آخر 7 أيام</h3>
                <div class="daily-orders">
                    ${last7Days.map(day => `
                        <div class="daily-order-item">
                            <span class="day-date">${day.date}</span>
                            <div class="day-stats">
                                <span class="day-orders"><i class="fas fa-shopping-cart"></i> ${day.count} طلب</span>
                                <span class="day-revenue"><i class="fas fa-coins"></i> ${day.revenue.toFixed(2)} ج.م</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div class="report-card full-width">
                <h3><i class="fas fa-exclamation-circle"></i> تحذير: منتجات قليلة المخزون</h3>
                <div class="low-stock-products">
                    ${products.filter(p => p.quantity < 5 && p.quantity > 0).length > 0 ? products.filter(p => p.quantity < 5 && p.quantity > 0).map(product => `
                        <div class="low-stock-item">
                            <span class="product-name">${product.name}</span>
                            <span class="stock-warning">متبقي ${product.quantity} فقط</span>
                            <button class="btn btn-sm btn-primary" onclick="editProduct(${product.id})">
                                <i class="fas fa-edit"></i> تعديل
                            </button>
                        </div>
                    `).join('') : '<p class="no-data">جميع المنتجات لديها مخزون كافٍ ✓</p>'}
                </div>
            </div>
        </div>
        
        <div class="export-actions">
            <button class="btn btn-success" onclick="exportReportToExcel()">
                <i class="fas fa-file-excel"></i> تصدير إلى Excel
            </button>
            <button class="btn btn-danger" onclick="exportReportToPDF()">
                <i class="fas fa-file-pdf"></i> تصدير إلى PDF
            </button>
            <button class="btn btn-primary" onclick="printReport()">
                <i class="fas fa-print"></i> طباعة التقرير
            </button>
        </div>
    `;
    
    const container = document.getElementById('reportsContainer');
    if (container) {
        container.innerHTML = reportsHTML;
    }
}

function exportReportToExcel() {
    showToast('قريباً', 'ميزة التصدير إلى Excel قيد التطوير', 'info');
}

function exportReportToPDF() {
    showToast('قريباً', 'ميزة التصدير إلى PDF قيد التطوير', 'info');
}

function printReport() {
    window.print();
}

// ==================== إعدادات Supabase ====================
async function initSupabase() {
    try {
        if (typeof window.supabase === 'undefined') {
            console.error('❌ مكتبة Supabase غير محملة');
            return false;
        }
        
        if (!SUPABASE_URL || !SUPABASE_KEY) {
            console.log('⚠️ بيانات Supabase غير موجودة');
            return false;
        }
        
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        const { data, error } = await supabaseClient.from('products').select('*').limit(1);
        
        if (error) {
            console.error('❌ خطأ Supabase:', error);
            return false;
        }
        
        console.log('✅ تم الاتصال بـ Supabase بنجاح');
        return true;
    } catch (error) {
        console.error('❌ خطأ في الاتصال:', error);
        return false;
    }
}

async function loadDataFromSupabase() {
    if (!supabaseClient) return;
    
    try {
        const { data: productsData, error: productsError } = await supabaseClient
            .from('products')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (productsError) throw productsError;
        
        products = productsData || [];
        console.log('📦 تم تحميل', products.length, 'منتج');
        
        const { data: ordersData } = await supabaseClient
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false });
        
        orders = ordersData || [];
        
        const dbCategories = [...new Set(products.map(p => p.category))].filter(c => c);
        const savedCategories = localStorage.getItem('categories');
        const localCategories = savedCategories ? JSON.parse(savedCategories) : [];
        categories = [...new Set([...dbCategories, ...localCategories])].filter(c => c);
        localStorage.setItem('categories', JSON.stringify(categories));
        
        displayProducts();
        updateCategoryFilters();
        
        if (isAdminLoggedIn) {
            adminSearchProducts();
            displayOrders();
            updateOrderContacts();
            updateCategorySelects();
        }
    } catch (error) {
        console.error('❌ خطأ في تحميل البيانات:', error);
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
        showToast('خطأ', 'فشل الاتصال بـ Supabase', 'error');
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
        const { error } = await tempSupabase.from('products').select('count');
        
        if (error) {
            showToast('خطأ', 'فشل الاتصال: ' + error.message, 'error');
        } else {
            showToast('نجاح', 'تم الاتصال بـ Supabase بنجاح ✓', 'success');
        }
    } catch (error) {
        showToast('خطأ', 'خطأ في الاتصال', 'error');
    }
}

// ==================== الإشعارات ====================
function showToast(title, message, type = 'success') {
    const toast = document.getElementById('toast');
    document.getElementById('toastTitle').textContent = title;
    document.getElementById('toastMessage').textContent = message;
    
    toast.className = 'toast ' + type;
    const icons = { 'success': 'fa-check', 'error': 'fa-exclamation-circle', 'warning': 'fa-exclamation-triangle', 'info': 'fa-info-circle' };
    toast.querySelector('.toast-icon i').className = `fas ${icons[type]}`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 5000);
}

function hideToast() { document.getElementById('toast').classList.remove('show'); }

// ==================== Loading Screen Functions ====================
function updateLoadingText(text) {
    const loadingText = document.querySelector('.loading-text');
    if (loadingText) {
        loadingText.textContent = text;
    }
}

function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
        loadingScreen.classList.add('hidden');
        setTimeout(() => {
            loadingScreen.remove();
        }, 500);
    }
}

// ==================== تهيئة التطبيق ====================
window.onload = async function() {
    console.log('🚀 بدء تحميل التطبيق...');
    
    updateCartCount();
    hideToast();
    
    const savedUrl = localStorage.getItem('supabaseUrl');
    const savedKey = localStorage.getItem('supabaseKey');
    if (savedUrl && savedKey) {
        SUPABASE_URL = savedUrl;
        SUPABASE_KEY = savedKey;
        console.log('✅ تم تحميل إعدادات Supabase');
    }
    
    loadSupabaseSettings();
    
    updateLoadingText('جاري الاتصال بقاعدة البيانات...');
    
    const connected = await initSupabase();
    if (connected) {
        updateLoadingText('جاري تحميل المنتجات...');
        await loadDataFromSupabase();
    } else {
        showToast('تنبيه', 'يرجى إعداد اتصال Supabase', 'warning');
    }
    
    const adminPhone = localStorage.getItem('adminPhone');
    if (adminPhone) {
        document.getElementById('adminPhoneNumber').textContent = adminPhone;
        document.getElementById('adminPhone').value = adminPhone;
    }
    
    showStore();
    
    setTimeout(() => {
        hideLoadingScreen();
    }, 1000);
    
    console.log('✅ تم تحميل التطبيق بنجاح');
};

document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') searchProducts();
        });
    }
    
    const adminSearchInput = document.getElementById('adminSearchInput');
    if (adminSearchInput) {
        adminSearchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') adminSearchProducts();
        });
    }
});