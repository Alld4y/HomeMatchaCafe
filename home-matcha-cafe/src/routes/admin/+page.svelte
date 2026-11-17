<script lang="ts">
    import { onMount } from 'svelte';
    import swal from 'sweetalert2';

    interface AdminOrder {
        id: string;
        order_id: string;
        name: string;
        phone: string;
        address: string;
        message?: string;
        basket: Array<{
            id: string;
            name?: string;
            thaiName?: string;
            englishName?: string;
            price: number;
            basePrice?: number;
            addonName?: string;
            addonPrice?: number;
            quantity: number;
            sweetness?: number;
            note?: string;
        }>;
        totalPrice: number;
        slipImage?: string;
        slipRef?: string;
        slipAmount?: number;
        slipTimeText?: string;
        qrGeneratedAt?: string;
        needsManualReview?: boolean;
        reviewReason?: string;
        deliveryDate?: string;
        deliveryRound?: string;
        deliveryRoundId?: string;
        status: 'pending' | 'paid' | 'brewing' | 'ready_to_ship' | 'delivering' | 'completed' | 'cancelled';
        createdAt: string;
        updatedAt: string;
    }

    interface DeliveryRoundConfig {
        id: string;
        name: string;
        timeSlot: string;
        cutoffTime: string;
        allowFermented: boolean;
        isAllDayOpen?: boolean;
        enabled: boolean;
    }

    interface StoreSettingsData {
        isMasterOpen: boolean;
        closedAlertMessage: string;
        advanceBookingHours: number;
        maxAdvanceDays?: number;
        advanceBookingMode?: 'days' | 'hours';
        limitDropdownToAdvanceWindow?: boolean;
        fermentedCutoffTime: string;
        fermentedItemIds: string[];
        deliveryRounds: DeliveryRoundConfig[];
        calendar: Record<string, { isOpen: boolean; customRounds?: string[]; note?: string }>;
        loyaltyEnabled?: boolean;
        loyaltyStampsRequired?: number;
        loyaltyExpireDays?: number;
        loyaltyRedeemableItemIds?: string[];
    }

    // 🔐 ระบบล็อกรหัสผ่านหน้า Admin (ตรวจสอบกับ ADMIN_PASSWORD ใน .env)
    let isAdminAuthenticated = $state(false);
    let adminPasswordInput = $state('');
    let adminAuthError = $state('');
    let isVerifyingAdmin = $state(false);

    // แท็บหน้า Admin: 'orders' | 'settings' | 'members' | 'menus'
    let activeTab = $state<'orders' | 'settings' | 'members' | 'menus'>('orders');

    // ข้อมูลคำสั่งซื้อ
    let orders = $state<AdminOrder[]>([]);
    let loading = $state(true);
    let selectedFilter = $state('all');
    let selectedSlip = $state<string | null>(null);
    let previousManualReviewCount = -1;

    // ระบบเลือกรายการพร้อมกัน (Bulk Action)
    let selectedOrderIds = $state<string[]>([]);

    // ข้อมูลการตั้งค่าร้านและปฏิทิน + ตั้งค่าสะสมแต้ม
    let settings = $state<StoreSettingsData>({
        isMasterOpen: true,
        closedAlertMessage: 'ขณะนี้ร้านปิดรับออเดอร์ชั่วคราวค่ะ',
        advanceBookingHours: 72,
        maxAdvanceDays: 3,
        advanceBookingMode: 'days',
        limitDropdownToAdvanceWindow: true,
        fermentedCutoffTime: '23:00',
        fermentedItemIds: ['cold-fermented-matcha-oat-latte'],
        loyaltyEnabled: true,
        loyaltyStampsRequired: 10,
        loyaltyExpireDays: 60,
        loyaltyRedeemableItemIds: [
            'pure-matcha',
            'matcha-latte',
            'matcha-coconut',
            'matcha-latte-oat',
            'cold-fermented-matcha-oat-latte'
        ],
        deliveryRounds: [
            { id: 'morning', name: 'รอบเช้า', timeSlot: '07:00–08:00 น.', cutoffTime: '06:00', allowFermented: true, isAllDayOpen: false, enabled: true },
            { id: 'noon', name: 'รอบเที่ยง', timeSlot: '12:30–13:00 น.', cutoffTime: '11:30', allowFermented: true, isAllDayOpen: false, enabled: true },
            { id: 'allday', name: 'รอบรวมเช้า-บ่าย', timeSlot: '09:00–13:00 น.', cutoffTime: '13:00', allowFermented: true, isAllDayOpen: true, enabled: true }
        ],
        calendar: {}
    });
    let isSavingSettings = $state(false);

    // 👥 ข้อมูลสมาชิกและบัตรสะสมแต้ม
    let membersList = $state<any[]>([]);
    let memberSearchQuery = $state('');
    let editingMemberModal = $state<{
        id: number;
        firstName: string;
        lastName: string;
        phone: string;
        pin: string;
        points: number;
        cardExpiresAt: string;
    } | null>(null);
    let filteredMembers = $derived(
        !memberSearchQuery.trim()
            ? membersList
            : membersList.filter(
                  (m) =>
                      (m.fullName || '').toLowerCase().includes(memberSearchQuery.trim().toLowerCase()) ||
                      (m.phone || '').includes(memberSearchQuery.trim())
              )
    );

    // 🧋 ข้อมูลเมนูและหมวดหมู่เครื่องดื่ม
    let menuCategories = $state<any[]>([]);
    let menuItems = $state<any[]>([]);
    let editingMenuModal = $state<{
        isNew: boolean;
        id: string;
        thaiName: string;
        englishName: string;
        price: number;
        category: string;
        description: string;
        notes: string;
        imageUrl: string;
        imageFile: File | null;
        imagePreview: string;
        isPromotion: boolean;
        isSignature: boolean;
        isFermented: boolean;
        isAvailable: boolean;
        tagsText: string;
        addons: Array<{ id: string; name: string; price: number }>;
        sortOrder: number;
    } | null>(null);
    let editingCategoryModal = $state<{
        isNew: boolean;
        id: string;
        name: string;
        icon: string;
        sortOrder: number;
    } | null>(null);

    // ตัวแปรสำหรับปฏิทินรายเดือนในแท็บ Settings
    let calendarDate = $state(new Date());
    let currentCalYear = $derived(calendarDate.getFullYear());
    let currentCalMonth = $derived(calendarDate.getMonth()); // 0-11
    let editingDayModal = $state<{ dateStr: string; isOpen: boolean; customRounds: string[] } | null>(null);

    // ➕ ระบบสร้างออเดอร์/เพิ่มแก้วลงคิวด้วยตนเอง (Admin Manual Order Creation)
    let showCreateOrderModal = $state<boolean>(false);
    let createOrderMode = $state<'member' | 'guest'>('member');
    let createOrderMemberSearch = $state<string>('');
    let selectedMemberForOrder = $state<any | null>(null);

    let newOrderName = $state<string>('');
    let newOrderPhone = $state<string>('');
    let newOrderAddress = $state<string>('หน้าร้าน (รับเอง)');
    let newOrderSellerMessage = $state<string>('');
    let newOrderDeliveryDate = $state<string>('');
    let newOrderDeliveryRound = $state<string>('รับหน้าร้าน / เสิร์ฟทันที');
    let newOrderDeliveryRoundId = $state<string>('walkin');
    let newOrderStatus = $state<'paid' | 'brewing' | 'ready_to_ship' | 'completed' | 'pending'>('paid');
    let newOrderPaymentNote = $state<string>('ชำระแล้ว (เงินสด/แอดมินรับยอด)');
    let newOrderCustomTotal = $state<number | null>(null);

    let newOrderBasket = $state<Array<{
        id: string;
        thaiName: string;
        englishName: string;
        price: number;
        basePrice?: number;
        addonName?: string;
        addonPrice?: number;
        addonId?: string;
        quantity: number;
        sweetness: number;
        note: string;
    }>>([]);

    let currentDrinkMenuId = $state<string>('');
    let currentDrinkAddonId = $state<string>('');
    let currentDrinkSweetness = $state<number>(50);
    let currentDrinkQuantity = $state<number>(1);
    let currentDrinkNote = $state<string>('');
    let currentDrinkCustomPrice = $state<number | null>(null);
    let isSubmittingCreateOrder = $state<boolean>(false);

    let filteredMembersForOrder = $derived.by(() => {
        if (!membersList || membersList.length === 0) return [];
        const q = createOrderMemberSearch.trim().toLowerCase();
        if (!q) return membersList.slice(0, 15);
        return membersList.filter((m: any) => {
            const name = (m.fullName || `${m.firstName || ''} ${m.lastName || ''}`).toLowerCase();
            const phone = (m.phone || '').replace(/[^0-9]/g, '');
            return name.includes(q) || phone.includes(q);
        }).slice(0, 20);
    });

    let newOrderCalculatedTotal = $derived(
        newOrderBasket.reduce((sum, item) => sum + (item.price * item.quantity), 0)
    );

    let effectiveNewOrderTotal = $derived(
        newOrderCustomTotal !== null && newOrderCustomTotal >= 0 ? newOrderCustomTotal : newOrderCalculatedTotal
    );

    function openCreateOrderModal() {
        loadMembers();
        loadMenus();
        newOrderBasket = [];
        selectedMemberForOrder = null;
        createOrderMemberSearch = '';
        createOrderMode = 'member';
        newOrderName = '';
        newOrderPhone = '';
        newOrderAddress = 'หน้าร้าน (รับเอง)';
        newOrderSellerMessage = '';
        newOrderDeliveryDate = new Date().toISOString().split('T')[0];
        newOrderDeliveryRound = 'รับหน้าร้าน / เสิร์ฟทันที';
        newOrderDeliveryRoundId = 'walkin';
        newOrderStatus = 'paid';
        newOrderPaymentNote = 'ชำระแล้ว (เงินสด/แอดมินรับยอด)';
        newOrderCustomTotal = null;
        currentDrinkMenuId = menuItems.length > 0 ? menuItems[0].id : '';
        currentDrinkAddonId = '';
        currentDrinkSweetness = 50;
        currentDrinkQuantity = 1;
        currentDrinkNote = '';
        currentDrinkCustomPrice = null;
        showCreateOrderModal = true;
    }

    function selectMemberForNewOrder(m: any) {
        selectedMemberForOrder = m;
        newOrderName = m.fullName || `${m.firstName || ''} ${m.lastName || ''}`.trim() || 'สมาชิก';
        newOrderPhone = m.phone || '';
        createOrderMemberSearch = '';
    }

    function clearSelectedMemberForOrder() {
        selectedMemberForOrder = null;
        newOrderName = '';
        newOrderPhone = '';
        createOrderMemberSearch = '';
    }

    function addDrinkToNewOrder() {
        if (!currentDrinkMenuId && menuItems.length > 0) {
            currentDrinkMenuId = menuItems[0].id;
        }
        const item = menuItems.find((m: any) => m.id === currentDrinkMenuId);
        if (!item) {
            swal.fire({ icon: 'warning', title: 'กรุณาเลือกเมนูเครื่องดื่ม', confirmButtonColor: '#456f2f' });
            return;
        }

        const selectedItemAddon = (item.addons || []).find((a: any) => a.id === currentDrinkAddonId);
        const addonPrice = selectedItemAddon ? Number(selectedItemAddon.price || 0) : 0;
        const basePrice = Number(item.price || 55);
        const price = currentDrinkCustomPrice !== null && currentDrinkCustomPrice >= 0
            ? currentDrinkCustomPrice
            : (basePrice + addonPrice);

        newOrderBasket = [
            ...newOrderBasket,
            {
                id: item.id,
                thaiName: item.thaiName || item.name || 'มัทฉะ',
                englishName: item.englishName || item.id,
                price,
                basePrice,
                addonName: selectedItemAddon ? selectedItemAddon.name : undefined,
                addonPrice: selectedItemAddon ? addonPrice : undefined,
                addonId: selectedItemAddon ? selectedItemAddon.id : undefined,
                quantity: Math.max(1, currentDrinkQuantity || 1),
                sweetness: currentDrinkSweetness ?? 50,
                note: currentDrinkNote.trim()
            }
        ];

        currentDrinkQuantity = 1;
        currentDrinkNote = '';
        currentDrinkCustomPrice = null;
        currentDrinkAddonId = '';
    }

    function removeDrinkFromNewOrder(idx: number) {
        newOrderBasket = newOrderBasket.filter((_, i) => i !== idx);
    }

    async function handleConfirmCreateOrder() {
        if (!newOrderName.trim()) {
            swal.fire({ icon: 'warning', title: 'กรุณากรอกชื่อลูกค้าหรือเลือกสมาชิก', confirmButtonColor: '#456f2f' });
            return;
        }
        if (newOrderBasket.length === 0) {
            swal.fire({ icon: 'warning', title: 'ยังไม่มีเครื่องดื่มในรายการ', text: 'กรุณาเลือกเครื่องดื่มแล้วกด "+ เพิ่มแก้วนี้ลงรายการ" ก่อนบันทึกนะคะ', confirmButtonColor: '#456f2f' });
            return;
        }

        isSubmittingCreateOrder = true;
        try {
            const finalMessageParts = [
                newOrderPaymentNote ? `[${newOrderPaymentNote}]` : '',
                selectedMemberForOrder ? `(สมาชิก: ${selectedMemberForOrder.fullName || selectedMemberForOrder.phone})` : '',
                newOrderSellerMessage ? newOrderSellerMessage.trim() : ''
            ].filter(Boolean);

            const payload = {
                name: newOrderName.trim(),
                phone: newOrderPhone.trim() || '0000000000',
                address: newOrderAddress.trim() || 'หน้าร้าน (รับเอง)',
                message: finalMessageParts.join(' '),
                basket: newOrderBasket,
                totalPrice: effectiveNewOrderTotal,
                deliveryDate: newOrderDeliveryDate || new Date().toISOString().split('T')[0],
                deliveryRound: newOrderDeliveryRound,
                deliveryRoundId: newOrderDeliveryRoundId,
                status: newOrderStatus,
                isAdminCreated: true
            };

            const res = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await res.json();
            if (res.ok && result.success) {
                showCreateOrderModal = false;
                await loadOrders();
                await loadMembers();
                swal.fire({
                    icon: 'success',
                    title: 'เพิ่มออเดอร์ลงคิวสำเร็จ! 🍵',
                    text: `รหัสคำสั่งซื้อ: ${result.order_id || result.order?.order_id || ''}`,
                    confirmButtonColor: '#456f2f'
                });
            } else {
                swal.fire({
                    icon: 'error',
                    title: 'บันทึกไม่สำเร็จ',
                    text: result.message || 'เกิดข้อผิดพลาดในการสร้างออเดอร์',
                    confirmButtonColor: '#d9483b'
                });
            }
        } catch (err: any) {
            console.error('Error creating order:', err);
            swal.fire({ icon: 'error', title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', confirmButtonColor: '#d9483b' });
        } finally {
            isSubmittingCreateOrder = false;
        }
    }

    function copyOrderLineLink(order: any) {
        if (typeof window === 'undefined') return;
        const origin = window.location.origin;
        const trackingUrl = `${origin}/success?phone=${encodeURIComponent(order.phone)}&openExternalBrowser=1`;
        navigator.clipboard.writeText(trackingUrl);
        swal.fire({
            icon: 'success',
            title: 'คัดลอกลิงก์ส่ง LINE สำเร็จ! 🍵',
            text: `ลิงก์: ${trackingUrl}\n(ระบบจะเปิดใน Safari/Chrome ให้อัตโนมัติเมื่อกดใน LINE)`,
            timer: 3000,
            showConfirmButton: false
        });
    }

    // รายการเมนูสำหรับเลือกเมนูบ่ม (อัปเดตตามรายการเมนูจริงอัตโนมัติ)
    let availableDrinks = $derived(
        menuItems.length > 0
            ? menuItems.map((m) => ({ id: m.id, name: m.thaiName }))
            : [
                  { id: 'cold-fermented-matcha-oat-latte', name: 'มัทฉะลาเต้นมโอ๊ตบ่ม' },
                  { id: 'pure-matcha', name: 'เพียวมัทฉะ' },
                  { id: 'matcha-latte', name: 'มัทฉะลาเต้' },
                  { id: 'matcha-coconut', name: 'มัทฉะมะพร้าว' },
                  { id: 'matcha-oat-latte', name: 'มัทฉะลาเต้นมโอ๊ต' }
              ]
    );

    // คำนวณสรุปยอด
    let totalSales = $derived(
        orders
            .filter((o) => o.status !== 'cancelled' && o.status !== 'pending')
            .reduce((sum, o) => sum + (o.totalPrice || 0), 0)
    );
    let manualReviewOrders = $derived(orders.filter((o) => o.status === 'pending'));
    let brewingCount = $derived(orders.filter((o) => o.status === 'brewing' || o.status === 'paid').length);
    let readyToShipCount = $derived(orders.filter((o) => o.status === 'ready_to_ship').length);
    let completedCount = $derived(orders.filter((o) => o.status === 'completed').length);

    // เรียงลำดับคำสั่งซื้อตามเวลาที่สั่ง (FIFO: สั่งก่อนอยู่บนสุด ตามบรีฟแม่ค้า)
    let sortedOrders = $derived(
        [...orders].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    );

    let filteredOrders = $derived(
        selectedFilter === 'all'
            ? sortedOrders
            : sortedOrders.filter((o) => o.status === selectedFilter)
    );

    // ในแท็บ "ทั้งหมด" ปุ่มเลือกทั้งหมดจะเลือกเฉพาะรายการที่ "รับยอดแล้ว (รอชง)" (status === 'paid') เท่านั้น ไม่เลือกรายการที่ยกเลิกหรือเสร็จสิ้นแล้ว
    let selectableOrders = $derived(
        selectedFilter === 'all'
            ? filteredOrders.filter((o) => o.status === 'paid')
            : filteredOrders.filter((o) => o.status !== 'cancelled' && o.status !== 'completed' && o.status !== 'pending')
    );

    let isAllSelected = $derived(
        selectableOrders.length > 0 && selectableOrders.every((o) => selectedOrderIds.includes(o.id))
    );

    async function loadOrders() {
        loading = true;
        try {
            const res = await fetch('/api/orders');
            if (res.ok) {
                const loaded: AdminOrder[] = await res.json();
                const currentReviewCount = loaded.filter((o) => o.status === 'pending').length;

                if (previousManualReviewCount !== -1 && currentReviewCount > previousManualReviewCount) {
                    swal.fire({
                        toast: true,
                        position: 'top-end',
                        icon: 'warning',
                        title: `🔔 มีคำขอตรวจสลิปใหม่ (${currentReviewCount} รายการ)`,
                        showConfirmButton: false,
                        timer: 3500
                    });
                }
                previousManualReviewCount = currentReviewCount;
                orders = loaded;
                window.dispatchEvent(new CustomEvent('orders-updated'));
            }
        } catch (e) {
            console.error('Error fetching admin orders:', e);
        } finally {
            loading = false;
        }
    }

    async function loadSettings() {
        try {
            const res = await fetch('/api/settings');
            if (res.ok) {
                const data = await res.json();
                if (data.settings) {
                    settings = data.settings;
                }
            }
        } catch (e) {
            console.error('Error loading settings:', e);
        }
    }

    async function saveAllSettings() {
        isSavingSettings = true;
        try {
            const res = await fetch('/api/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            const data = await res.json();
            if (res.ok && data.success) {
                window.dispatchEvent(new CustomEvent('loyalty-settings-updated'));
                swal.fire({
                    icon: 'success',
                    title: 'บันทึกสำเร็จ!',
                    text: 'บันทึกการตั้งค่าร้านและระบบสะสมแต้มเรียบร้อยแล้วค่ะ',
                    confirmButtonColor: '#456f2f'
                });
            } else {
                swal.fire('ข้อผิดพลาด', data.message || 'บันทึกไม่สำเร็จ', 'error');
            }
        } catch (e) {
            console.error(e);
            swal.fire('ข้อผิดพลาด', 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', 'error');
        } finally {
            isSavingSettings = false;
        }
    }

    async function handleToggleLoyaltyMaster() {
        try {
            const res = await fetch('/api/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ loyaltyEnabled: settings.loyaltyEnabled })
            });
            if (res.ok) {
                window.dispatchEvent(new CustomEvent('loyalty-settings-updated'));
                const toast = swal.mixin({
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 1800
                });
                toast.fire({
                    icon: settings.loyaltyEnabled ? 'success' : 'info',
                    title: settings.loyaltyEnabled
                        ? '🟢 เปิดใช้งานระบบสะสมแต้มแล้ว'
                        : '🔴 ปิดระบบสะสมแต้มชั่วคราวแล้ว'
                });
            }
        } catch (e) {
            console.error(e);
        }
    }

    async function updateStatus(orderId: string, newStatus: AdminOrder['status']) {
        try {
            const res = await fetch(`/api/orders/${orderId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });

            if (res.ok) {
                const result = await res.json();
                const idx = orders.findIndex((o) => o.id === orderId || o.order_id === orderId);
                if (idx > -1 && result.order) {
                    orders[idx] = result.order;
                }
                previousManualReviewCount = orders.filter((o) => o.status === 'pending').length;
                await loadMembers();
                window.dispatchEvent(new CustomEvent('orders-updated'));

                const toast = swal.mixin({
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 1500
                });
                toast.fire({
                    icon: 'success',
                    title: `อัปเดตสถานะเป็น "${getStatusName(newStatus)}" แล้ว`
                });
            } else {
                swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถเปลี่ยนสถานะได้', 'error');
            }
        } catch (e) {
            console.error(e);
            swal.fire('ขัดข้อง', 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', 'error');
        }
    }

    // อัปเดตสถานะพร้อมกันหลายรายการ (Bulk Update)
    async function updateBulk(newStatus: AdminOrder['status']) {
        if (selectedOrderIds.length === 0) return;

        try {
            const res = await fetch('/api/orders/bulk', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: selectedOrderIds, status: newStatus })
            });

            if (res.ok) {
                const result = await res.json();
                await loadOrders();
                await loadMembers();
                selectedOrderIds = [];

                swal.fire({
                    icon: 'success',
                    title: 'สำเร็จ!',
                    text: `อัปเดต ${result.count} ออเดอร์ เป็น "${getStatusName(newStatus)}" เรียบร้อยแล้ว`,
                    timer: 2000,
                    showConfirmButton: false
                });
            } else {
                swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถอัปเดตพร้อมกันได้', 'error');
            }
        } catch (e) {
            console.error(e);
            swal.fire('ขัดข้อง', 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', 'error');
        }
    }

    function toggleSelectAll() {
        if (isAllSelected) {
            selectedOrderIds = [];
        } else {
            selectedOrderIds = selectableOrders.map((o) => o.id);
        }
    }

    function toggleSelectOrder(id: string) {
        const targetOrder = orders.find((o) => o.id === id);
        if (targetOrder && (targetOrder.status === 'cancelled' || targetOrder.status === 'completed' || targetOrder.status === 'pending')) {
            return;
        }
        if (selectedOrderIds.includes(id)) {
            selectedOrderIds = selectedOrderIds.filter((item) => item !== id);
        } else {
            selectedOrderIds = [...selectedOrderIds, id];
        }
    }

    function getStatusName(status: string) {
        switch (status) {
            case 'pending': return 'รอตรวจสลิป';
            case 'paid': return 'รับยอดแล้ว (รอชง)';
            case 'brewing': return '🍵 กำลังชง';
            case 'ready_to_ship': return '✨ ชงเสร็จแล้ว (รอส่ง)';
            case 'delivering': return '🛵 กำลังจัดส่ง';
            case 'completed': return '✅ จัดส่งสำเร็จ';
            case 'cancelled': return 'ยกเลิก';
            default: return status;
        }
    }

    function formatTime(isoStr?: string) {
        if (!isoStr) return '-';
        try {
            const date = new Date(isoStr);
            return date.toLocaleString('th-TH', {
                dateStyle: 'short',
                timeStyle: 'short'
            });
        } catch {
            return isoStr;
        }
    }

    // Helper สร้างข้อมูลปฏิทินรายเดือน
    function getCalendarMonthGrid(year: number, month: number) {
        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0);
        const daysInMonth = lastDayOfMonth.getDate();
        const startDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sun

        const grid: Array<{ dayNum: number; dateStr: string; isCurrentMonth: boolean }> = [];

        // เติมวันจากเดือนก่อนหน้า
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        for (let i = startDayOfWeek - 1; i >= 0; i--) {
            const d = prevMonthLastDay - i;
            const prevD = new Date(year, month - 1, d);
            grid.push({
                dayNum: d,
                dateStr: `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
                isCurrentMonth: false
            });
        }

        // วันในเดือนปัจจุบัน
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            grid.push({
                dayNum: d,
                dateStr,
                isCurrentMonth: true
            });
        }

        // เติมวันเดือนถัดไปให้ครบสัปดาห์ (42 ช่อง = 6 แถว)
        const remaining = 42 - grid.length;
        for (let d = 1; d <= remaining; d++) {
            const nextD = new Date(year, month + 1, d);
            grid.push({
                dayNum: d,
                dateStr: `${nextD.getFullYear()}-${String(nextD.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
                isCurrentMonth: false
            });
        }

        return grid;
    }

    function toggleDayOpen(dateStr: string) {
        const current = settings.calendar[dateStr] || { isOpen: false };
        const dParts = dateStr.split('-').map(Number);
        const dayOfWeek = new Date(dParts[0], dParts[1] - 1, dParts[2]).getDay();
        const defaultRounds = (dayOfWeek === 0 || dayOfWeek === 6) ? ['allday'] : ['morning', 'noon'];
        settings.calendar[dateStr] = {
            ...current,
            isOpen: !current.isOpen,
            customRounds: current.customRounds && current.customRounds.length > 0 ? current.customRounds : defaultRounds
        };
    }

    function openEditDayModal(dateStr: string) {
        const dParts = dateStr.split('-').map(Number);
        const dayOfWeek = new Date(dParts[0], dParts[1] - 1, dParts[2]).getDay();
        const defaultRounds = (dayOfWeek === 0 || dayOfWeek === 6) ? ['allday'] : ['morning', 'noon'];
        const current = settings.calendar[dateStr] || { isOpen: true, customRounds: defaultRounds };
        editingDayModal = {
            dateStr,
            isOpen: Boolean(current.isOpen),
            customRounds: current.customRounds && current.customRounds.length > 0 ? [...current.customRounds] : defaultRounds
        };
    }

    function toggleRoundInDayModal(round: DeliveryRoundConfig, checked: boolean) {
        if (!editingDayModal) return;
        const isCombinedRound = round.id === 'allday' || Boolean(round.isAllDayOpen);

        if (isCombinedRound) {
            // ถ้ารวบเช้า-บ่าย (09:00-13:00) จะเลือกได้แค่รอบนี้รอบเดียว
            if (checked) {
                editingDayModal.customRounds = [round.id];
            } else {
                editingDayModal.customRounds = editingDayModal.customRounds.filter(id => id !== round.id);
            }
        } else {
            // ถ้าเลือกรอบเช้าหรือรอบเที่ยงปกติ ให้เอาตัวรวบเช้า-บ่าย (allday) ออกอัตโนมัติ
            if (checked) {
                const withoutAllDay = editingDayModal.customRounds.filter(id => id !== 'allday');
                if (!withoutAllDay.includes(round.id)) {
                    editingDayModal.customRounds = [...withoutAllDay, round.id];
                } else {
                    editingDayModal.customRounds = withoutAllDay;
                }
            } else {
                editingDayModal.customRounds = editingDayModal.customRounds.filter(id => id !== round.id);
            }
        }
    }

    async function saveDayModalConfig() {
        if (!editingDayModal) return;
        if (editingDayModal.isOpen && editingDayModal.customRounds.length === 0) {
            swal.fire({
                icon: 'warning',
                title: 'กรุณาเลือกรอบส่ง',
                text: 'กรุณาติ๊กเลือกรอบจัดส่งอย่างน้อย 1 รอบสำหรับวันที่เปิดร้านค่ะ',
                confirmButtonColor: '#456f2f'
            });
            return;
        }

        settings.calendar[editingDayModal.dateStr] = {
            isOpen: editingDayModal.isOpen,
            customRounds: editingDayModal.customRounds
        };
        editingDayModal = null;

        // บันทึกลงระบบทันทีเมื่อกดยืนยันใน Modal รายวัน
        try {
            await fetch('/api/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
        } catch (e) {
            console.error('Auto-save day config failed:', e);
        }
    }

    const thaiMonthNames = [
        'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];

    // 🔐 ฟังก์ชันยืนยันรหัสผ่านหน้า Admin
    async function handleAdminPasswordSubmit(e: Event) {
        e.preventDefault();
        if (!adminPasswordInput.trim()) {
            adminAuthError = 'กรุณากรอกรหัสผ่านแอดมิน';
            return;
        }
        isVerifyingAdmin = true;
        adminAuthError = '';
        try {
            const res = await fetch('/api/admin/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: adminPasswordInput })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                isAdminAuthenticated = true;
                sessionStorage.setItem('hmc_admin_auth', 'true');
                adminPasswordInput = '';
                loadOrders();
                loadSettings();
                loadMembers();
                loadMenus();
            } else {
                adminAuthError = data.message || 'รหัสผ่านไม่ถูกต้อง';
            }
        } catch {
            adminAuthError = 'เกิดข้อผิดพลาดในการตรวจสอบรหัสผ่าน';
        } finally {
            isVerifyingAdmin = false;
        }
    }

    function handleLockAdmin() {
        isAdminAuthenticated = false;
        sessionStorage.removeItem('hmc_admin_auth');
    }

    // 👥 ฟังก์ชันจัดการสมาชิกและแต้มสะสม
    async function loadMembers() {
        try {
            const res = await fetch('/api/members');
            if (res.ok) {
                const data = await res.json();
                membersList = data.members || [];
            }
        } catch (e) {
            console.error('Error loading members:', e);
        }
    }

    async function adjustMemberPoints(member: any, delta: number) {
        const nextPoints = Math.max(0, Number(member.points || 0) + delta);
        try {
            const res = await fetch('/api/members', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: member.id, points: nextPoints })
            });
            if (res.ok) {
                await loadMembers();
            }
        } catch (e) {
            console.error(e);
        }
    }

    async function redeemMemberFreeCupByAdmin(member: any) {
        const reqStamps = Number(settings.loyaltyStampsRequired) || 10;
        if (Number(member.points || 0) < reqStamps) {
            swal.fire({
                icon: 'warning',
                title: 'แต้มยังไม่ครบ',
                text: `คุณ ${member.fullName} มี ${member.points}/${reqStamps} ดวง ยังไม่ครบสำหรับแลกแก้วฟรีค่ะ`,
                confirmButtonColor: '#456f2f'
            });
            return;
        }

        const confirmRes = await swal.fire({
            icon: 'question',
            title: `ยืนยันตัดแต้มแลกแก้วฟรี?`,
            text: `หัก ${reqStamps} แต้มของ คุณ ${member.fullName} (${member.phone}) เพื่อแลกเครื่องดื่มฟรี 1 แก้ว`,
            showCancelButton: true,
            confirmButtonColor: '#16a34a',
            confirmButtonText: `✓ หัก ${reqStamps} แต้ม`,
            cancelButtonText: 'ยกเลิก'
        });

        if (!confirmRes.isConfirmed) return;

        try {
            const res = await fetch('/api/members', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'redeem', phone: member.phone, stampsToDeduct: reqStamps })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                await loadMembers();
                swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'success',
                    title: data.message || 'ตัดแต้มแลกแก้วฟรีสำเร็จ!',
                    showConfirmButton: false,
                    timer: 2500
                });
            }
        } catch (e) {
            console.error(e);
        }
    }

    function openEditMemberModal(member: any) {
        const expDateStr = member.cardExpiresAt
            ? new Date(member.cardExpiresAt).toISOString().slice(0, 10)
            : '';
        editingMemberModal = {
            id: member.id,
            firstName: member.firstName || '',
            lastName: member.lastName || '',
            phone: member.phone || '',
            pin: '',
            points: Number(member.points || 0),
            cardExpiresAt: expDateStr
        };
    }

    async function saveEditedMember() {
        if (!editingMemberModal) return;
        const payload: any = {
            id: editingMemberModal.id,
            firstName: editingMemberModal.firstName,
            lastName: editingMemberModal.lastName,
            phone: editingMemberModal.phone,
            points: Number(editingMemberModal.points) || 0,
            cardExpiresAt: editingMemberModal.cardExpiresAt
                ? new Date(editingMemberModal.cardExpiresAt + 'T23:59:59').toISOString()
                : null
        };
        if (editingMemberModal.pin.trim() !== '') {
            payload.pin = editingMemberModal.pin.trim();
        }

        try {
            const res = await fetch('/api/members', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                editingMemberModal = null;
                await loadMembers();
                swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'success',
                    title: 'บันทึกข้อมูลสมาชิกเรียบร้อยแล้ว',
                    showConfirmButton: false,
                    timer: 2000
                });
            }
        } catch (e) {
            console.error(e);
        }
    }

    async function deleteMember(member: any) {
        const confirmRes = await swal.fire({
            icon: 'warning',
            title: `ลบสมาชิก คุณ ${member.fullName}?`,
            text: `เบอร์โทร ${member.phone} และแต้มสะสมจะถูกลบออกจากระบบ`,
            showCancelButton: true,
            confirmButtonColor: '#d9483b',
            confirmButtonText: 'ลบสมาชิก',
            cancelButtonText: 'ยกเลิก'
        });
        if (!confirmRes.isConfirmed) return;

        try {
            const res = await fetch(`/api/members?id=${member.id}`, { method: 'DELETE' });
            if (res.ok) {
                await loadMembers();
            }
        } catch (e) {
            console.error(e);
        }
    }

    // 🧋 ฟังก์ชันจัดการเมนูและหมวดหมู่เครื่องดื่ม
    async function loadMenus() {
        try {
            const res = await fetch('/api/menus');
            if (res.ok) {
                const data = await res.json();
                menuCategories = data.categories || [];
                menuItems = data.items || [];
            }
        } catch (e) {
            console.error('Error loading menus:', e);
        }
    }

    function openAddMenuModal() {
        editingMenuModal = {
            isNew: true,
            id: '',
            thaiName: '',
            englishName: '',
            price: 55,
            category: menuCategories[0]?.id || 'clear',
            description: '',
            notes: 'ชงสดใหม่แก้วต่อแก้ว',
            imageUrl: '',
            imageFile: null,
            imagePreview: '',
            isPromotion: false,
            isSignature: false,
            isFermented: false,
            isAvailable: true,
            tagsText: 'ชงสดใหม่, มัทฉะแท้',
            addons: [],
            sortOrder: menuItems.length + 1
        };
    }

    function openEditMenuModal(item: any) {
        editingMenuModal = {
            isNew: false,
            id: item.id,
            thaiName: item.thaiName || '',
            englishName: item.englishName || '',
            price: Number(item.price) || 55,
            category: item.category || 'clear',
            description: item.description || '',
            notes: item.notes || '',
            imageUrl: item.imageUrl || '',
            imageFile: null,
            imagePreview: item.imageUrl || `/image/${item.id}.jpg`,
            isPromotion: Boolean(item.isPromotion),
            isSignature: Boolean(item.isSignature),
            isFermented: Boolean(item.isFermented),
            isAvailable: item.isAvailable !== false,
            tagsText: Array.isArray(item.tags) ? item.tags.join(', ') : '',
            addons: Array.isArray(item.addons)
                ? item.addons.map((a: any, idx: number) => ({
                      id: a.id || `addon-${idx + 1}`,
                      name: a.name || '',
                      price: Number(a.price) || 0
                  }))
                : [],
            sortOrder: Number(item.sortOrder) || 1
        };
    }

    function addAddonOptionToModal(defaultName = '', defaultPrice = 20) {
        if (!editingMenuModal) return;
        editingMenuModal.addons = [
            ...(editingMenuModal.addons || []),
            {
                id: `addon-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                name: defaultName,
                price: defaultPrice
            }
        ];
    }

    function removeAddonOptionFromModal(idx: number) {
        if (!editingMenuModal) return;
        editingMenuModal.addons = editingMenuModal.addons.filter((_, i) => i !== idx);
    }

    function handleMenuImageSelect(e: Event) {
        const target = e.target as HTMLInputElement;
        if (target.files && target.files.length > 0 && editingMenuModal) {
            editingMenuModal.imageFile = target.files[0];
            editingMenuModal.imagePreview = URL.createObjectURL(target.files[0]);
        }
    }

    async function saveMenuModal() {
        if (!editingMenuModal) return;
        if (!editingMenuModal.thaiName.trim()) {
            swal.fire({ icon: 'warning', title: 'กรุณากรอกชื่อเมนูภาษาไทย', confirmButtonColor: '#456f2f' });
            return;
        }

        const tags = editingMenuModal.tagsText
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);

        const cleanAddons = (editingMenuModal.addons || [])
            .filter((a) => a.name && a.name.trim() !== '')
            .map((a, idx) => ({
                id: a.id || `addon-${idx + 1}`,
                name: a.name.trim(),
                price: Number(a.price) >= 0 ? Number(a.price) : 0
            }));

        const formData = new FormData();
        formData.append('id', editingMenuModal.id);
        formData.append('thaiName', editingMenuModal.thaiName.trim());
        formData.append('englishName', (editingMenuModal.englishName || editingMenuModal.thaiName).trim().toUpperCase());
        formData.append('price', String(editingMenuModal.price));
        formData.append('category', editingMenuModal.category);
        formData.append('description', editingMenuModal.description);
        formData.append('notes', editingMenuModal.notes);
        formData.append('imageUrl', editingMenuModal.imageUrl);
        formData.append('isPromotion', String(editingMenuModal.isPromotion));
        formData.append('isSignature', String(editingMenuModal.isSignature));
        formData.append('isFermented', String(editingMenuModal.isFermented));
        formData.append('isAvailable', String(editingMenuModal.isAvailable));
        formData.append('sortOrder', String(editingMenuModal.sortOrder));
        formData.append('tags', JSON.stringify(tags));
        formData.append('addons', JSON.stringify(cleanAddons));
        if (editingMenuModal.imageFile) {
            formData.append('imageFile', editingMenuModal.imageFile);
        }

        try {
            const res = await fetch('/api/menus', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (res.ok && data.success) {
                menuCategories = data.categories || menuCategories;
                menuItems = data.items || menuItems;
                editingMenuModal = null;
                await loadSettings();
                swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'success',
                    title: 'บันทึกเมนูเรียบร้อยแล้ว!',
                    showConfirmButton: false,
                    timer: 2000
                });
            }
        } catch (e) {
            console.error(e);
        }
    }

    async function handleDeleteMenuItem(item: any) {
        const confirmRes = await swal.fire({
            icon: 'warning',
            title: `ลบเมนู "${item.thaiName}"?`,
            text: 'คุณต้องการลบเมนูนี้ออกจากหน้าร้านใช่หรือไม่',
            showCancelButton: true,
            confirmButtonColor: '#d9483b',
            confirmButtonText: 'ลบเมนู',
            cancelButtonText: 'ยกเลิก'
        });
        if (!confirmRes.isConfirmed) return;

        try {
            const res = await fetch(`/api/menus?type=item&id=${encodeURIComponent(item.id)}`, { method: 'DELETE' });
            const data = await res.json();
            if (res.ok && data.success) {
                menuItems = data.items || [];
            }
        } catch (e) {
            console.error(e);
        }
    }

    function openAddCategoryModal() {
        editingCategoryModal = {
            isNew: true,
            id: '',
            name: '',
            icon: '🍵',
            sortOrder: menuCategories.length + 1
        };
    }

    function openEditCategoryModal(cat: any) {
        editingCategoryModal = {
            isNew: false,
            id: cat.id,
            name: cat.name,
            icon: cat.icon || '🍵',
            sortOrder: Number(cat.sortOrder) || 1
        };
    }

    async function saveCategoryModal() {
        if (!editingCategoryModal || !editingCategoryModal.name.trim()) return;
        try {
            const res = await fetch('/api/menus', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'category',
                    id: editingCategoryModal.id,
                    name: editingCategoryModal.name.trim(),
                    icon: editingCategoryModal.icon || '🍵',
                    sortOrder: editingCategoryModal.sortOrder
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                menuCategories = data.categories || [];
                editingCategoryModal = null;
                swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'success',
                    title: 'บันทึกหมวดหมู่เรียบร้อยแล้ว',
                    showConfirmButton: false,
                    timer: 2000
                });
            }
        } catch (e) {
            console.error(e);
        }
    }

    async function handleDeleteCategory(cat: any) {
        const confirmRes = await swal.fire({
            icon: 'warning',
            title: `ลบหมวดหมู่ "${cat.name}"?`,
            showCancelButton: true,
            confirmButtonColor: '#d9483b',
            confirmButtonText: 'ลบหมวดหมู่',
            cancelButtonText: 'ยกเลิก'
        });
        if (!confirmRes.isConfirmed) return;

        try {
            const res = await fetch(`/api/menus?type=category&id=${encodeURIComponent(cat.id)}`, { method: 'DELETE' });
            const data = await res.json();
            if (res.ok && data.success) {
                menuCategories = data.categories || [];
            }
        } catch (e) {
            console.error(e);
        }
    }

    onMount(() => {
        if (typeof window !== 'undefined' && sessionStorage.getItem('hmc_admin_auth') === 'true') {
            isAdminAuthenticated = true;
        }
        loadOrders();
        loadSettings();
        loadMembers();
        loadMenus();
        const interval = setInterval(() => {
            if (isAdminAuthenticated) {
                loadOrders();
                loadMembers();
            }
        }, 10000);
        return () => clearInterval(interval);
    });
</script>

<svelte:head>
    <title>ระบบจัดการร้าน & คิวชง (Admin) | Home Matcha Cafe</title>
</svelte:head>

<!-- Modal ขยายดูรูปภาพสลิป -->
{#if selectedSlip}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div 
        style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; z-index: 999999; padding: 1.5rem;"
        onclick={() => (selectedSlip = null)}
    >
        <div style="position: relative; max-width: 90vw; max-height: 90vh; display: flex; flex-direction: column; align-items: center; gap: 0.75rem;" onclick={(e) => e.stopPropagation()}>
            <img src={selectedSlip} alt="Slip Full" style="max-width: 100%; max-height: 80vh; border-radius: 14px; box-shadow: 0 10px 40px rgba(0,0,0,0.6);" />
            <div style="display: flex; gap: 0.75rem;">
                <a 
                    href={selectedSlip} 
                    target="_blank" 
                    rel="noreferrer"
                    style="background: #2563eb; color: #fff; padding: 0.4rem 1rem; border-radius: 20px; font-size: 0.85rem; text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 0.35rem;"
                >
                    ↗ เปิดในแท็บใหม่
                </a>
            </div>
            <button 
                onclick={() => (selectedSlip = null)}
                style="position: absolute; top: -14px; right: -14px; width: 38px; height: 38px; border-radius: 50%; background: #d9483b; color: #fff; border: 2px solid #fff; font-weight: bold; font-size: 1.1rem; cursor: pointer;"
            >
                ✕
            </button>
        </div>
    </div>
{/if}

<!-- Modal ปรับแต่งรอบส่งรายวัน -->
{#if editingDayModal}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div 
        style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 99999; padding: 1rem;"
        onclick={() => (editingDayModal = null)}
    >
        <div 
            style="background: #ffffff; border-radius: 20px; max-width: 460px; width: 100%; padding: 1.5rem; text-align: left; box-shadow: 0 20px 50px rgba(0,0,0,0.25);"
            onclick={(e) => e.stopPropagation()}
        >
            <h3 style="margin: 0 0 0.5rem 0; font-size: 1.2rem; color: var(--matcha-deep);">
                🗓️ กำหนดรอบส่งวันที่ {editingDayModal.dateStr}
            </h3>
            
            <div style="margin: 0.85rem 0; padding: 0.75rem 1rem; border-radius: 12px; background: {editingDayModal.isOpen ? '#f0fdf4' : '#fef2f2'}; border: 1px solid {editingDayModal.isOpen ? '#bbf7d0' : '#fecdd3'}; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 700; color: {editingDayModal.isOpen ? '#166534' : '#991b1b'}; font-size: 0.95rem;">
                    สถานะ: {editingDayModal.isOpen ? '🟢 เปิดรับออเดอร์' : '⚪ ปิดร้านในวันนี้'}
                </span>
                <button
                    type="button"
                    onclick={() => editingDayModal && (editingDayModal.isOpen = !editingDayModal.isOpen)}
                    style="padding: 0.35rem 0.8rem; font-size: 0.8rem; border-radius: 999px; border: 1px solid currentColor; background: #fff; cursor: pointer; font-weight: 600;"
                >
                    สลับสถานะ
                </button>
            </div>

            {#if editingDayModal.isOpen}
                <div style="margin-top: 1rem;">
                    <label class="form-label" style="margin-bottom: 0.5rem; display: block; font-weight: 700; color: #1e293b;" for="dayModalRounds">
                        รอบที่เปิดให้บริการในวันนี้:
                    </label>
                    <div style="display: flex; flex-direction: column; gap: 0.6rem;" id="dayModalRounds">
                        {#each settings.deliveryRounds as round}
                            {@const isChecked = editingDayModal.customRounds.includes(round.id)}
                            {@const isCombined = round.id === 'allday' || Boolean(round.isAllDayOpen)}
                            <label 
                                style="
                                    display: flex; 
                                    align-items: flex-start; 
                                    gap: 0.65rem; 
                                    font-size: 0.9rem; 
                                    cursor: pointer; 
                                    padding: 0.65rem 0.8rem; 
                                    border-radius: 12px; 
                                    border: 1.5px solid {isChecked ? (isCombined ? '#7c3aed' : 'var(--matcha-primary)') : '#e2e8f0'}; 
                                    background: {isChecked ? (isCombined ? '#f5f3ff' : '#f0fdf4') : '#ffffff'};
                                    transition: all 0.15s;
                                "
                            >
                                <input 
                                    type="checkbox"
                                    checked={isChecked}
                                    onchange={(e) => toggleRoundInDayModal(round, (e.target as HTMLInputElement).checked)}
                                    style="width: 18px; height: 18px; margin-top: 2px; accent-color: {isCombined ? '#7c3aed' : 'var(--matcha-primary)'}; flex-shrink: 0;"
                                />
                                <div style="display: flex; flex-direction: column; gap: 0.15rem;">
                                    <span style="color: #1e293b;">
                                        <strong>{round.name}</strong> ({round.timeSlot})
                                    </span>
                                    {#if isCombined}
                                        <span style="font-size: 0.75rem; color: #6d28d9; line-height: 1.35;">
                                            ✨ รวบเช้า-บ่ายเป็นรอบเดียว · เมนูไม่บ่มสั่งได้ตลอด / เมนูบ่มสั่งล่วงหน้าก่อน {settings.fermentedCutoffTime} น. วันก่อนเปิด
                                        </span>
                                    {:else if round.id === 'morning'}
                                        <span style="font-size: 0.74rem; color: #64748b;">
                                            🌤 เมนูบ่มสั่งก่อน {settings.fermentedCutoffTime} น. วันก่อนเปิด / เมนูไม่บ่มตัดรอบ {round.cutoffTime} น.
                                        </span>
                                    {:else}
                                        <span style="font-size: 0.74rem; color: #64748b;">
                                            ☀️ เมนูบ่มสั่งก่อน {settings.fermentedCutoffTime} น. วันก่อนเปิด / เมนูไม่บ่มตัดรอบ {round.cutoffTime} น.
                                        </span>
                                    {/if}
                                </div>
                            </label>
                        {/each}
                    </div>
                </div>
            {/if}

            <div style="display: flex; gap: 0.5rem; margin-top: 1.35rem;">
                <button onclick={saveDayModalConfig} class="btn-matcha-primary" style="flex: 1; padding: 0.7rem;">
                    ✓ ยืนยันการตั้งค่า
                </button>
                <button onclick={() => (editingDayModal = null)} class="btn-matcha-outline" style="padding: 0.7rem 1rem;">
                    ยกเลิก
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- Modal แก้ไขข้อมูลสมาชิก แต้ม และวันหมดอายุบัตร -->
{#if editingMemberModal}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.65); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 99999; padding: 1rem;"
        onclick={() => (editingMemberModal = null)}
    >
        <div
            style="background: #ffffff; border-radius: 20px; max-width: 460px; width: 100%; padding: 1.5rem; text-align: left; box-shadow: 0 20px 50px rgba(0,0,0,0.25);"
            onclick={(e) => e.stopPropagation()}
        >
            <h3 style="margin: 0 0 1rem 0; font-size: 1.2rem; color: var(--matcha-deep);">
                ✏️ แก้ไขข้อมูลสมาชิก & บัตรสะสมแต้ม
            </h3>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.75rem;">
                <div>
                    <label class="form-label" style="font-size: 0.8rem;" for="editMemFname">ชื่อจริง:</label>
                    <input id="editMemFname" type="text" class="form-input" bind:value={editingMemberModal.firstName} />
                </div>
                <div>
                    <label class="form-label" style="font-size: 0.8rem;" for="editMemLname">นามสกุล:</label>
                    <input id="editMemLname" type="text" class="form-input" bind:value={editingMemberModal.lastName} />
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.75rem;">
                <div>
                    <label class="form-label" style="font-size: 0.8rem;" for="editMemPhone">เบอร์โทรศัพท์:</label>
                    <input id="editMemPhone" type="tel" class="form-input" bind:value={editingMemberModal.phone} />
                </div>
                <div>
                    <label class="form-label" style="font-size: 0.8rem;" for="editMemPin">เปลี่ยนรหัส PIN 4 หลัก (เว้นว่างถ้าไม่เปลี่ยน):</label>
                    <input id="editMemPin" type="text" maxlength="4" class="form-input" placeholder="เช่น 1234" bind:value={editingMemberModal.pin} />
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem;">
                <div>
                    <label class="form-label" style="font-size: 0.8rem;" for="editMemPoints">แต้มสะสมปัจจุบัน (ดวง):</label>
                    <input id="editMemPoints" type="number" min="0" class="form-input" bind:value={editingMemberModal.points} />
                </div>
                <div>
                    <label class="form-label" style="font-size: 0.8rem;" for="editMemExp">วันหมดอายุบัตร:</label>
                    <input id="editMemExp" type="date" class="form-input" bind:value={editingMemberModal.cardExpiresAt} />
                </div>
            </div>

            <div style="display: flex; gap: 0.5rem;">
                <button onclick={saveEditedMember} class="btn-matcha-primary" style="flex: 1; padding: 0.7rem;">
                    💾 บันทึกข้อมูลสมาชิก
                </button>
                <button onclick={() => (editingMemberModal = null)} class="btn-matcha-outline" style="padding: 0.7rem 1rem;">
                    ยกเลิก
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- Modal เพิ่ม / แก้ไขหมวดหมู่เครื่องดื่ม -->
{#if editingCategoryModal}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.65); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 99999; padding: 1rem;"
        onclick={() => (editingCategoryModal = null)}
    >
        <div
            style="background: #ffffff; border-radius: 20px; max-width: 420px; width: 100%; padding: 1.5rem; text-align: left; box-shadow: 0 20px 50px rgba(0,0,0,0.25);"
            onclick={(e) => e.stopPropagation()}
        >
            <h3 style="margin: 0 0 1rem 0; font-size: 1.2rem; color: var(--matcha-deep);">
                {editingCategoryModal.isNew ? '➕ เพิ่มหมวดหมู่เครื่องดื่มใหม่' : '✏️ แก้ไขหมวดหมู่เครื่องดื่ม'}
            </h3>

            <div style="display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1rem;">
                {#if editingCategoryModal.isNew}
                    <div>
                        <label class="form-label" style="font-size: 0.8rem;" for="catIdInput">รหัสหมวดหมู่ (ภาษาอังกฤษ เช่น latte, clear):</label>
                        <input id="catIdInput" type="text" class="form-input" placeholder="เช่น seasonal" bind:value={editingCategoryModal.id} />
                    </div>
                {/if}
                <div>
                    <label class="form-label" style="font-size: 0.8rem;" for="catNameInput">ชื่อหมวดหมู่ที่แสดง:</label>
                    <input id="catNameInput" type="text" class="form-input" placeholder="เช่น เมนูตามฤดูกาล" bind:value={editingCategoryModal.name} />
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                    <div>
                        <label class="form-label" style="font-size: 0.8rem;" for="catIconInput">ไอคอน (Emoji):</label>
                        <input id="catIconInput" type="text" class="form-input" bind:value={editingCategoryModal.icon} />
                    </div>
                    <div>
                        <label class="form-label" style="font-size: 0.8rem;" for="catSortInput">ลำดับการแสดงผล:</label>
                        <input id="catSortInput" type="number" class="form-input" bind:value={editingCategoryModal.sortOrder} />
                    </div>
                </div>
            </div>

            <div style="display: flex; gap: 0.5rem;">
                <button onclick={saveCategoryModal} class="btn-matcha-primary" style="flex: 1; padding: 0.7rem;">
                    💾 บันทึกหมวดหมู่
                </button>
                <button onclick={() => (editingCategoryModal = null)} class="btn-matcha-outline" style="padding: 0.7rem 1rem;">
                    ยกเลิก
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- Modal เพิ่ม / แก้ไขเมนูเครื่องดื่ม -->
{#if editingMenuModal}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.65); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 99999; padding: 1rem; overflow-y: auto;"
        onclick={() => (editingMenuModal = null)}
    >
        <div
            style="background: #ffffff; border-radius: 22px; max-width: 560px; width: 100%; padding: 1.5rem; text-align: left; box-shadow: 0 20px 50px rgba(0,0,0,0.3); max-height: 92vh; overflow-y: auto;"
            onclick={(e) => e.stopPropagation()}
        >
            <h3 style="margin: 0 0 1rem 0; font-size: 1.25rem; color: var(--matcha-deep);">
                {editingMenuModal.isNew ? '➕ เพิ่มเมนูเครื่องดื่มใหม่' : `✏️ แก้ไขเมนู: ${editingMenuModal.thaiName}`}
            </h3>

            <div style="display: flex; flex-direction: column; gap: 0.8rem;">
                {#if editingMenuModal.isNew}
                    <div>
                        <label class="form-label" style="font-size: 0.8rem;" for="menuIdInput">รหัสเมนู (ภาษาอังกฤษ หรือเว้นว่างให้สร้างอัตโนมัติ):</label>
                        <input id="menuIdInput" type="text" class="form-input" placeholder="เช่น matcha-yuzu" bind:value={editingMenuModal.id} />
                    </div>
                {/if}

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                    <div>
                        <label class="form-label" style="font-size: 0.8rem;" for="menuThInput">ชื่อเมนูภาษาไทย *:</label>
                        <input id="menuThInput" type="text" class="form-input" placeholder="เช่น เพียวมัทฉะ" bind:value={editingMenuModal.thaiName} />
                    </div>
                    <div>
                        <label class="form-label" style="font-size: 0.8rem;" for="menuEnInput">ชื่อเมนูภาษาอังกฤษ *:</label>
                        <input id="menuEnInput" type="text" class="form-input" placeholder="เช่น PURE MATCHA" bind:value={editingMenuModal.englishName} />
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                    <div>
                        <label class="form-label" style="font-size: 0.8rem;" for="menuPriceInput">ราคา (บาท) *:</label>
                        <input id="menuPriceInput" type="number" min="0" class="form-input" bind:value={editingMenuModal.price} />
                    </div>
                    <div>
                        <label class="form-label" style="font-size: 0.8rem;" for="menuCatSelect">หมวดหมู่เครื่องดื่ม:</label>
                        <select id="menuCatSelect" class="form-input" bind:value={editingMenuModal.category}>
                            {#each menuCategories as cat}
                                <option value={cat.id}>{cat.icon} {cat.name}</option>
                            {/each}
                        </select>
                    </div>
                </div>

                <div>
                    <label class="form-label" style="font-size: 0.8rem;" for="menuDescInput">คำอธิบายสินค้า:</label>
                    <textarea id="menuDescInput" rows="2" class="form-input" placeholder="บรรยายรสชาติและจุดเด่นของเมนู..." bind:value={editingMenuModal.description}></textarea>
                </div>

                <div>
                    <label class="form-label" style="font-size: 0.8rem;" for="menuNotesInput">คำแนะนำระดับความหวาน (แสดงในหน้าเลือกความหวาน):</label>
                    <input id="menuNotesInput" type="text" class="form-input" placeholder="เช่น แนะนำหวาน 25% หรือ 50%" bind:value={editingMenuModal.notes} />
                </div>

                <div>
                    <label class="form-label" style="font-size: 0.8rem;" for="menuTagsInput">ป้ายกำกับ (Tags คั่นด้วยเครื่องหมายลูกน้ำ ,):</label>
                    <input id="menuTagsInput" type="text" class="form-input" placeholder="เช่น เมนูยอดฮิต, นมโอ๊ต 100%, แนะนำ ✨" bind:value={editingMenuModal.tagsText} />
                </div>

                <!-- อัปโหลดรูปภาพเมนู -->
                <div style="background: #f8fbf6; border: 1px dashed #b9d3aa; border-radius: 12px; padding: 0.85rem;">
                    <label class="form-label" style="font-size: 0.8rem; display: block; margin-bottom: 0.4rem;" for="menuImgFile">
                        🖼️ รูปภาพเมนู (อัปโหลดรูปใหม่ หรือใช้รูปเดิม):
                    </label>
                    <div style="display: flex; align-items: center; gap: 0.85rem; flex-wrap: wrap;">
                        {#if editingMenuModal.imagePreview}
                            <img
                                src={editingMenuModal.imagePreview}
                                alt="Preview"
                                style="width: 68px; height: 68px; object-fit: cover; border-radius: 10px; border: 1px solid #d1e3c6;"
                            />
                        {/if}
                        <div style="flex: 1; min-width: 180px;">
                            <input id="menuImgFile" type="file" accept="image/*" onchange={handleMenuImageSelect} style="font-size: 0.8rem; width: 100%; margin-bottom: 0.35rem;" />
                            <input type="text" class="form-input" placeholder="หรือระบุ Path/URL รูปภาพ เช่น /image/pure-matcha.jpg" bind:value={editingMenuModal.imageUrl} style="font-size: 0.78rem; padding: 0.4rem 0.65rem;" />
                        </div>
                    </div>
                </div>

                <!-- 🍵 ตั้งค่าตัวเลือกเพิ่มช็อต / ท็อปปิ้งเสริมของเมนูนี้ -->
                <div style="background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 14px; padding: 0.9rem;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.6rem;">
                        <div>
                            <div style="font-size: 0.88rem; font-weight: 800; color: #14532d;">
                                🍵 ตัวเลือกเพิ่มช็อต / ช็อตอื่นๆ ของเมนูนี้ (เลือกได้ 1 ตัวเลือก/แก้ว)
                            </div>
                            <div style="font-size: 0.74rem; color: #166534;">
                                กำหนดชื่อช็อตและราคาบวกเพิ่มได้อย่างอิสระในแต่ละเมนู (เว้นว่างได้หากเมนูนี้ไม่มีให้เพิ่มช็อต)
                            </div>
                        </div>
                        <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
                            <button
                                type="button"
                                onclick={() => addAddonOptionToModal('เพิ่มช็อตมัทฉะ', 10)}
                                style="background: #dcfce7; color: #14532d; border: 1px solid #4ade80; border-radius: 999px; padding: 0.25rem 0.65rem; font-size: 0.74rem; font-weight: 800; cursor: pointer;"
                            >
                                + เพิ่มช็อตมัทฉะ
                            </button>
                            <button
                                type="button"
                                onclick={() => addAddonOptionToModal('', 10)}
                                style="background: #16a34a; color: #ffffff; border: none; border-radius: 999px; padding: 0.25rem 0.7rem; font-size: 0.74rem; font-weight: 800; cursor: pointer;"
                            >
                                + เพิ่มตัวเลือกช็อตใหม่
                            </button>
                        </div>
                    </div>

                    {#if !editingMenuModal.addons || editingMenuModal.addons.length === 0}
                        <div style="font-size: 0.78rem; color: #64748b; text-align: center; padding: 0.5rem; background: rgba(255,255,255,0.7); border-radius: 8px;">
                            ยังไม่มีตัวเลือกเพิ่มช็อตในเมนูนี้ (กดปุ่มด้านบนเพื่อเพิ่มตัวเลือกช็อตและกำหนดราคาได้เลย)
                        </div>
                    {:else}
                        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                            {#each editingMenuModal.addons as addon, idx}
                                <div style="display: flex; align-items: center; gap: 0.5rem; background: #ffffff; padding: 0.45rem 0.6rem; border-radius: 10px; border: 1px solid #bbf7d0;">
                                    <div style="flex: 1; min-width: 120px;">
                                        <input
                                            type="text"
                                            class="form-input"
                                            placeholder="ชื่อช็อต เช่น เพิ่มช็อตมัทฉะ, เพิ่มช็อตโฮจิฉะ"
                                            bind:value={addon.name}
                                            style="font-size: 0.82rem; padding: 0.38rem 0.6rem;"
                                        />
                                    </div>
                                    <div style="display: flex; align-items: center; gap: 0.3rem; flex-shrink: 0;">
                                        <span style="font-size: 0.78rem; font-weight: 700; color: #166534;">+</span>
                                        <input
                                            type="number"
                                            min="0"
                                            class="form-input"
                                            bind:value={addon.price}
                                            style="width: 74px; font-size: 0.85rem; font-weight: 800; padding: 0.38rem 0.5rem; text-align: center;"
                                        />
                                        <span style="font-size: 0.78rem; font-weight: 700; color: #166534;">฿</span>
                                    </div>
                                    <button
                                        type="button"
                                        onclick={() => removeAddonOptionFromModal(idx)}
                                        style="background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; border-radius: 8px; padding: 0.35rem 0.55rem; font-size: 0.78rem; font-weight: 800; cursor: pointer; flex-shrink: 0;"
                                        title="ลบตัวเลือกนี้"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>

                <!-- สวิตช์ตั้งค่า Promo / Signature / เมนูบ่ม / สถานะเปิดขาย -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; background: #f1f6ee; padding: 0.85rem; border-radius: 12px;">
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.84rem; font-weight: 700; cursor: pointer;">
                        <input type="checkbox" bind:checked={editingMenuModal.isPromotion} style="width: 17px; height: 17px; accent-color: #d97706;" />
                        <span>🔥 ตั้งเป็นเมนู PROMO</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.84rem; font-weight: 700; cursor: pointer;">
                        <input type="checkbox" bind:checked={editingMenuModal.isSignature} style="width: 17px; height: 17px; accent-color: var(--matcha-primary);" />
                        <span>⭐ ตั้งเป็นเมนู Signature (โชว์หน้าแรก)</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.84rem; font-weight: 700; cursor: pointer;">
                        <input type="checkbox" bind:checked={editingMenuModal.isFermented} style="width: 17px; height: 17px; accent-color: #7c3aed;" />
                        <span>🧊 เป็นเมนูบ่ม (สั่งล่วงหน้า)</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.84rem; font-weight: 700; cursor: pointer;">
                        <input type="checkbox" bind:checked={editingMenuModal.isAvailable} style="width: 17px; height: 17px; accent-color: #16a34a;" />
                        <span>✅ เปิดจำหน่ายเมนูนี้</span>
                    </label>
                </div>
            </div>

            <div style="display: flex; gap: 0.5rem; margin-top: 1.25rem;">
                <button onclick={saveMenuModal} class="btn-matcha-primary" style="flex: 1; padding: 0.75rem;">
                    💾 บันทึกข้อมูลเมนู
                </button>
                <button onclick={() => (editingMenuModal = null)} class="btn-matcha-outline" style="padding: 0.75rem 1rem;">
                    ยกเลิก
                </button>
            </div>
        </div>
    </div>
{/if}

{#if !isAdminAuthenticated}
    <!-- 🔐 หน้าล็อกอินรหัสผ่านสำหรับเข้าหน้า Admin (ตั้งค่าได้ใน .env ADMIN_PASSWORD) -->
    <main class="menu-page-wrapper" style="min-height: 85vh; display: flex; align-items: center; justify-content: center; padding: 1.5rem;">
        <div style="background: #ffffff; border: 1.5px solid #d5e6cc; border-radius: 24px; max-width: 410px; width: 100%; padding: 2.2rem 1.75rem; text-align: center; box-shadow: 0 20px 50px rgba(32, 60, 24, 0.12);">
            <div style="width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, #2d5a27, #528741); color: #fff; font-size: 1.8rem; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem auto; box-shadow: 0 8px 20px rgba(45, 90, 39, 0.25);">
                🔐
            </div>
            <h1 style="margin: 0 0 0.35rem 0; font-size: 1.45rem; font-weight: 800; color: var(--matcha-deep);">
                เข้าสู่ระบบจัดการร้าน (Admin)
            </h1>
            <p style="margin: 0 0 1.25rem 0; font-size: 0.85rem; color: var(--text-muted);">
                กรุณากรอกรหัสผ่านผู้ดูแลระบบเพื่อเข้าจัดการร้าน Home Matcha Cafe
            </p>

            {#if adminAuthError}
                <div style="background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; font-size: 0.82rem; font-weight: 600; padding: 0.6rem; border-radius: 10px; margin-bottom: 1rem;">
                    ⚠️ {adminAuthError}
                </div>
            {/if}

            <form onsubmit={handleAdminPasswordSubmit} style="display: flex; flex-direction: column; gap: 0.85rem;">
                <input
                    type="password"
                    class="form-input"
                    placeholder="กรอกรหัสผ่านแอดมิน..."
                    bind:value={adminPasswordInput}
                    style="text-align: center; font-size: 1.1rem; padding: 0.8rem;"
                    required
                />
                <button
                    type="submit"
                    class="btn-matcha-primary"
                    disabled={isVerifyingAdmin}
                    style="width: 100%; padding: 0.85rem; font-size: 1rem;"
                >
                    {isVerifyingAdmin ? 'กำลังตรวจสอบ...' : '🔓 เข้าสู่หน้าแอดมิน'}
                </button>
            </form>
        </div>
    </main>
{:else}
<main class="menu-page-wrapper admin-page-shell" style="max-width: 1240px; margin: 0 auto; width: 100%; padding-bottom: 5rem;">
    <!-- Admin Header -->
    <div class="admin-header-bar">
        <div class="admin-header-title-box">
            <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.35rem;">
                <span class="status-pill open">BARISTA & CAFE OWNER</span>
                <span style="font-size: 0.8rem; background: {settings.isMasterOpen ? '#dcfce7' : '#fee2e2'}; color: {settings.isMasterOpen ? '#166534' : '#991b1b'}; padding: 0.15rem 0.6rem; border-radius: 999px; font-weight: 700;">
                    {settings.isMasterOpen ? '● ร้านเปิดรับออเดอร์' : '○ ร้านปิดรับออเดอร์'}
                </span>
            </div>
            <h1 class="admin-page-title">ระบบจัดการร้าน & คิวชง (Admin)</h1>
            <p class="admin-page-subtitle">
                Home Matcha Cafe @ รพ.ทองผาภูมิ · อัปเดตข้อมูลอัตโนมัติทุก 10 วินาที
            </p>
        </div>

        <div class="admin-header-actions">
            <button onclick={openCreateOrderModal} class="btn-matcha-primary" style="padding: 0.5rem 1rem; font-size: 0.85rem; font-weight: 800; background: #15803d; border-color: #15803d; display: inline-flex; align-items: center; gap: 0.35rem;">
                ➕ เพิ่มออเดอร์เข้าคิว
            </button>
            <button onclick={() => { loadOrders(); loadMembers(); loadMenus(); }} class="btn-matcha-outline" style="padding: 0.5rem 1rem; font-size: 0.85rem;">
                🔄 รีเฟรชข้อมูล
            </button>
            <button onclick={handleLockAdmin} class="btn-danger" style="padding: 0.5rem 0.9rem; font-size: 0.82rem;">
                🔒 ล็อกหน้าแอดมิน
            </button>
        </div>
    </div>

    <!-- แถบสลับแท็บหลัก 4 แท็บ -->
    <div class="admin-main-tabs">
        <button 
            type="button"
            onclick={() => (activeTab = 'orders')}
            class="admin-main-tab-btn {activeTab === 'orders' ? 'active' : ''}"
        >
            <span>🍵 คิวชง & ออเดอร์</span>
            {#if brewingCount > 0}
                <span style="background: var(--matcha-primary); color: #fff; font-size: 0.72rem; padding: 0.08rem 0.45rem; border-radius: 999px;">
                    {brewingCount}
                </span>
            {/if}
            {#if manualReviewOrders.length > 0}
                <span style="background: #d97706; color: #fff; font-size: 0.72rem; padding: 0.08rem 0.45rem; border-radius: 999px;">
                    🔔 {manualReviewOrders.length}
                </span>
            {/if}
        </button>

        <button 
            type="button"
            onclick={() => (activeTab = 'settings')}
            class="admin-main-tab-btn {activeTab === 'settings' ? 'active' : ''}"
        >
            <span>📅 ปฏิทิน & รอบส่ง</span>
        </button>

        <button 
            type="button"
            onclick={() => { activeTab = 'members'; loadMembers(); }}
            class="admin-main-tab-btn {activeTab === 'members' ? 'active' : ''}"
        >
            <span>👥 สมาชิก & แต้ม ({membersList.length})</span>
        </button>

        <button 
            type="button"
            onclick={() => { activeTab = 'menus'; loadMenus(); }}
            class="admin-main-tab-btn {activeTab === 'menus' ? 'active' : ''}"
        >
            <span>🧋 จัดการเมนู ({menuItems.length})</span>
        </button>
    </div>

    <!-- ============================================== -->
    <!-- แท็บที่ 1: คิวชงและคำสั่งซื้อ (Orders & Queue) -->
    <!-- ============================================== -->
    {#if activeTab === 'orders'}
        <!-- 🔔 แถบแจ้งเตือนพิเศษเมื่อมีคำขอตรวจสลิปด้วยตนเอง -->
        {#if manualReviewOrders.length > 0}
            <div style="width: 100%; background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border: 2px solid #f59e0b; border-radius: 16px; padding: 1.15rem 1.5rem; margin-bottom: 1.5rem; box-shadow: 0 6px 20px rgba(245, 158, 11, 0.15);">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
                    <div style="display: flex; align-items: flex-start; gap: 0.85rem;">
                        <div style="font-size: 1.8rem; line-height: 1;">🔔</div>
                        <div>
                            <h3 style="margin: 0; font-size: 1.1rem; color: #92400e;">
                                มีคำขอให้แอดมินตรวจสอบสลิปด้วยตนเอง ({manualReviewOrders.length} รายการ)
                            </h3>
                            <p style="margin: 0.2rem 0 0 0; font-size: 0.825rem; color: #b45309;">
                                ลูกค้าส่งคำขอให้ตรวจสอบสลิป กรุณาตรวจดูรูปสลิปก่อนกดอนุมัติรับยอดนะคะ
                            </p>
                        </div>
                    </div>
                    <button
                        onclick={() => (selectedFilter = 'pending')}
                        style="background: #d97706; color: #fff; border: none; border-radius: 999px; padding: 0.45rem 1.1rem; font-weight: 700; font-size: 0.825rem; cursor: pointer;"
                    >
                        🔍 ดูรายการรอตรวจสลิป ({manualReviewOrders.length})
                    </button>
                </div>
            </div>
        {/if}

        <!-- สรุปสถิติ 4 ช่อง -->
        <div class="admin-stats-grid">
            <div class="form-card admin-stat-card">
                <p style="margin: 0; font-size: 0.78rem; color: var(--text-muted);">💰 ยอดขายที่ยืนยันแล้ว</p>
                <h2 class="admin-stat-value" style="color: var(--matcha-dark);">
                    {Number(totalSales.toFixed(2))} <span style="font-size: 0.9rem; font-weight: 500;">บาท</span>
                </h2>
            </div>

            <div class="form-card admin-stat-card" style="{brewingCount > 0 ? 'border: 2px solid var(--matcha-primary); background: #f0fdf4;' : ''}">
                <p style="margin: 0; font-size: 0.78rem; color: {brewingCount > 0 ? '#166534' : 'var(--text-muted)'};">🍵 ต้องชง (รับยอด + กำลังชง)</p>
                <h2 class="admin-stat-value" style="color: var(--matcha-primary);">
                    {brewingCount} <span style="font-size: 0.9rem; font-weight: 500;">ออเดอร์</span>
                </h2>
            </div>

            <div class="form-card admin-stat-card" style="{readyToShipCount > 0 ? 'border: 2px solid #0284c7; background: #f0f9ff;' : ''}">
                <p style="margin: 0; font-size: 0.78rem; color: {readyToShipCount > 0 ? '#0369a1' : 'var(--text-muted)'};">✨ ชงเสร็จแล้ว (รอส่ง)</p>
                <h2 class="admin-stat-value" style="color: #0284c7;">
                    {readyToShipCount} <span style="font-size: 0.9rem; font-weight: 500;">ออเดอร์</span>
                </h2>
            </div>

            <div class="form-card admin-stat-card">
                <p style="margin: 0; font-size: 0.78rem; color: var(--text-muted);">✅ จัดส่งสำเร็จแล้ว</p>
                <h2 class="admin-stat-value" style="color: var(--green-status);">
                    {completedCount} <span style="font-size: 0.9rem; font-weight: 500;">ออเดอร์</span>
                </h2>
            </div>
        </div>

        <!-- แถบเครื่องมือจัดการคิวและปุ่มสร้างออเดอร์ -->
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 0.9rem;">
            <div style="font-size: 0.95rem; font-weight: 800; color: #1e293b; display: flex; align-items: center; gap: 0.4rem;">
                📋 กระดานคิวชงและคำสั่งซื้อ
            </div>
            <button 
                type="button"
                onclick={openCreateOrderModal} 
                class="btn-matcha-primary" 
                style="padding: 0.45rem 1.15rem; font-size: 0.85rem; font-weight: 800; background: #166534; box-shadow: 0 3px 10px rgba(22, 101, 52, 0.25); display: inline-flex; align-items: center; gap: 0.35rem;"
            >
                ➕ เพิ่มออเดอร์ / แก้วเข้าคิว
            </button>
        </div>

        <!-- แถบตัวกรองสถานะ -->
        <div class="category-filter-bar" style="margin-bottom: 1.25rem; width: 100%;">
            <button class="category-tab-btn {selectedFilter === 'all' ? 'active' : ''}" onclick={() => { selectedFilter = 'all'; selectedOrderIds = []; }}>
                ทั้งหมด ({orders.length})
            </button>
            <button 
                class="category-tab-btn {selectedFilter === 'pending' ? 'active' : ''}" 
                onclick={() => { selectedFilter = 'pending'; selectedOrderIds = []; }}
                style="{manualReviewOrders.length > 0 && selectedFilter !== 'pending' ? 'border-color: #f59e0b; color: #b45309; font-weight: 700;' : ''}"
            >
                🔔 รอตรวจสลิป ({manualReviewOrders.length})
            </button>
            <button class="category-tab-btn {selectedFilter === 'paid' ? 'active' : ''}" onclick={() => { selectedFilter = 'paid'; selectedOrderIds = []; }}>
                รับยอดแล้ว ({orders.filter((o) => o.status === 'paid').length})
            </button>
            <button class="category-tab-btn {selectedFilter === 'brewing' ? 'active' : ''}" onclick={() => { selectedFilter = 'brewing'; selectedOrderIds = []; }}>
                🍵 กำลังชง ({orders.filter((o) => o.status === 'brewing').length})
            </button>
            <button class="category-tab-btn {selectedFilter === 'ready_to_ship' ? 'active' : ''}" onclick={() => { selectedFilter = 'ready_to_ship'; selectedOrderIds = []; }}>
                ✨ ชงเสร็จแล้ว ({readyToShipCount})
            </button>
            <button class="category-tab-btn {selectedFilter === 'delivering' ? 'active' : ''}" onclick={() => { selectedFilter = 'delivering'; selectedOrderIds = []; }}>
                🛵 กำลังส่ง ({orders.filter((o) => o.status === 'delivering').length})
            </button>
            <button class="category-tab-btn {selectedFilter === 'completed' ? 'active' : ''}" onclick={() => { selectedFilter = 'completed'; selectedOrderIds = []; }}>
                สำเร็จ ({completedCount})
            </button>
        </div>

        <!-- กล่องเลือกทั้งหมด & คำสั่ง Bulk Action -->
        <div style="background: #ffffff; border: 1px solid var(--border-light); border-radius: 14px; padding: 0.85rem 1.25rem; margin-bottom: 1.25rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
            <div style="display: flex; align-items: center; gap: 0.6rem;">
                <input 
                    type="checkbox"
                    id="selectAllOrders"
                    checked={isAllSelected}
                    disabled={selectableOrders.length === 0}
                    onchange={toggleSelectAll}
                    style="width: 18px; height: 18px; accent-color: var(--matcha-primary); cursor: {selectableOrders.length === 0 ? 'not-allowed' : 'pointer'};"
                />
                <label for="selectAllOrders" style="font-size: 0.85rem; font-weight: 700; color: #334155; cursor: {selectableOrders.length === 0 ? 'not-allowed' : 'pointer'};">
                    {selectedFilter === 'all'
                        ? `เลือกเฉพาะรายการที่รอชงทั้งหมด (${selectedOrderIds.length}/${selectableOrders.length})`
                        : `เลือกทั้งหมดในหมวดนี้ (${selectedOrderIds.length}/${selectableOrders.length})`}
                </label>
            </div>

            <!-- ปุ่ม Bulk Action เมื่อมีรายการถูกเลือก -->
            {#if selectedOrderIds.length > 0}
                <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
                    <span style="font-size: 0.8rem; color: #64748b; margin-right: 0.25rem;">
                        สั่งการพร้อมกัน ({selectedOrderIds.length}):
                    </span>
                    <button 
                        type="button"
                        onclick={() => updateBulk('ready_to_ship')} 
                        class="btn-matcha-primary" 
                        style="padding: 0.4rem 0.8rem; font-size: 0.8rem; background: #0284c7;"
                    >
                        ✨ ชงเสร็จแล้วทั้งหมด
                    </button>
                    <button 
                        type="button"
                        onclick={() => updateBulk('delivering')} 
                        class="btn-gold" 
                        style="padding: 0.4rem 0.8rem; font-size: 0.8rem;"
                    >
                        🛵 นำส่งทั้งหมด
                    </button>
                    <button 
                        type="button"
                        onclick={() => updateBulk('completed')} 
                        class="btn-matcha-primary" 
                        style="padding: 0.4rem 0.8rem; font-size: 0.8rem; background: var(--green-status);"
                    >
                        ✅ ส่งสำเร็จทั้งหมด
                    </button>
                    <button 
                        type="button"
                        onclick={() => (selectedOrderIds = [])} 
                        style="background: #f1f5f9; border: 1px solid #cbd5e1; color: #475569; padding: 0.4rem 0.65rem; font-size: 0.8rem; border-radius: 6px; cursor: pointer;"
                    >
                        ✕ ยกเลิกเลือก
                    </button>
                </div>
            {:else}
                <div style="font-size: 0.8rem; color: #64748b;">
                    📌 เรียงลำดับตามเวลาสั่ง (FIFO: สั่งก่อนอยู่บนสุด เพื่อหยิบชงตามคิว)
                </div>
            {/if}
        </div>

        <!-- รายการออเดอร์ -->
        {#if loading && orders.length === 0}
            <div style="text-align: center; padding: 4rem 0;">
                <div class="spinner" style="margin: 0 auto 1rem auto;"></div>
                <p>กำลังโหลดรายการคำสั่งซื้อ...</p>
            </div>
        {:else if filteredOrders.length === 0}
            <div class="form-card" style="text-align: center; padding: 3rem 1.5rem; width: 100%;">
                <p style="font-size: 2.5rem; margin: 0 0 0.5rem 0;">📋</p>
                <h3 style="margin: 0; color: var(--matcha-deep);">ไม่มีคำสั่งซื้อในสถานะนี้</h3>
            </div>
        {:else}
            <div style="display: flex; flex-direction: column; gap: 1.25rem; width: 100%;">
                {#each filteredOrders as order, index}
                    <div 
                        class="form-card" 
                        style="
                            padding: 1.5rem; 
                            text-align: left; 
                            border-left: 6px solid {
                                order.status === 'ready_to_ship' ? '#0284c7' :
                                order.status === 'completed' ? 'var(--green-status)' : 
                                order.status === 'brewing' ? 'var(--matcha-primary)' : 
                                order.status === 'delivering' ? 'var(--gold-accent, #d97706)' : 
                                order.status === 'pending' ? '#d97706' : '#94a3b8'
                            }; 
                            {order.status === 'pending' ? 'background: #fffdf7;' : ''}
                        "
                    >
                        <!-- แถบด้านบน: Checkbox + คิวที่ + รหัสออเดอร์ + ปุ่มเปลี่ยนสถานะ -->
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border-light);">
                            <div style="display: flex; align-items: center; gap: 0.75rem;">
                                {#if order.status !== 'cancelled' && order.status !== 'completed' && order.status !== 'pending'}
                                    <input 
                                        type="checkbox"
                                        checked={selectedOrderIds.includes(order.id)}
                                        onchange={() => toggleSelectOrder(order.id)}
                                        style="width: 20px; height: 20px; accent-color: var(--matcha-primary); cursor: pointer;"
                                    />
                                {:else}
                                    <input 
                                        type="checkbox"
                                        disabled
                                        checked={false}
                                        title="ไม่สามารถเลือกออเดอร์ที่ยกเลิก/สำเร็จแล้ว/รอตรวจสลิป"
                                        style="width: 20px; height: 20px; opacity: 0.35; cursor: not-allowed;"
                                    />
                                {/if}
                                <div>
                                    <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                                        <span style="background: #1e293b; color: #fff; font-size: 0.75rem; font-weight: 800; padding: 0.15rem 0.5rem; border-radius: 6px;">
                                            คิวที่ {index + 1}
                                        </span>
                                        <h3 style="margin: 0; font-size: 1.15rem; color: var(--matcha-deep);">{order.order_id || order.id}</h3>
                                        <span class="status-pill {order.status}">
                                            <span class="pulse-dot"></span>
                                            {getStatusName(order.status)}
                                        </span>
                                    </div>
                                    <span style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-top: 0.2rem;">
                                        สั่งเมื่อ: <strong>{formatTime(order.createdAt)}</strong>
                                        {#if order.deliveryDate}
                                            · 🚚 วันส่ง: <strong>{order.deliveryDate}</strong> ({order.deliveryRound || 'รอบปกติ'})
                                        {/if}
                                    </span>
                                </div>
                            </div>

                            <!-- ปุ่ม Action เดี่ยวสำหรับเปลี่ยนสถานะ -->
                            <div style="display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center;">
                                {#if order.status === 'pending'}
                                    <button onclick={() => updateStatus(order.id, 'paid')} class="btn-matcha-primary" style="padding: 0.45rem 0.95rem; font-size: 0.82rem;">
                                        ✓ อนุมัติสลิป (รับยอด)
                                    </button>
                                    <button onclick={() => updateStatus(order.id, 'cancelled')} class="btn-danger" style="padding: 0.45rem 0.85rem; font-size: 0.8rem;">
                                        ✕ ปฏิเสธสลิป
                                    </button>
                                {/if}
                                {#if order.status === 'paid'}
                                    <button onclick={() => updateStatus(order.id, 'brewing')} class="btn-matcha-primary" style="padding: 0.45rem 0.95rem; font-size: 0.82rem; background: var(--matcha-mid);">
                                        🍵 เริ่มชง
                                    </button>
                                {/if}
                                {#if order.status === 'brewing'}
                                    <button onclick={() => updateStatus(order.id, 'ready_to_ship')} class="btn-matcha-primary" style="padding: 0.45rem 0.95rem; font-size: 0.82rem; background: #0284c7;">
                                        ✨ ชงเสร็จแล้ว (รอส่ง)
                                    </button>
                                {/if}
                                {#if order.status === 'ready_to_ship'}
                                    <button onclick={() => updateStatus(order.id, 'delivering')} class="btn-gold" style="padding: 0.45rem 0.95rem; font-size: 0.82rem;">
                                        🛵 เริ่มนำส่ง
                                    </button>
                                {/if}
                                {#if order.status === 'delivering'}
                                    <button onclick={() => updateStatus(order.id, 'completed')} class="btn-matcha-primary" style="padding: 0.45rem 0.95rem; font-size: 0.82rem; background: var(--green-status);">
                                        ✅ ส่งสำเร็จ
                                    </button>
                                {/if}
                                {#if order.status !== 'completed' && order.status !== 'cancelled' && order.status !== 'pending'}
                                    <button onclick={() => updateStatus(order.id, 'cancelled')} class="btn-danger" style="padding: 0.4rem 0.75rem; font-size: 0.75rem;">
                                        ยกเลิก
                                    </button>
                                {/if}
                            </div>
                        </div>

                        <!-- รายละเอียดผู้รับ & เครื่องดื่มที่สั่ง & สลิป -->
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; margin-top: 1rem;">
                            <!-- ข้อมูลผู้สั่ง -->
                            <div>
                                <p style="margin: 0; font-size: 0.75rem; color: var(--text-muted);">ผู้สั่งซื้อ & สถานที่จัดส่ง</p>
                                <p style="margin: 0; font-weight: 700; color: var(--matcha-deep); font-size: 0.95rem;">
                                    {order.name} (<a href="tel:{order.phone}" style="color: var(--matcha-primary); text-decoration: none;">{order.phone}</a>)
                                </p>
                                <p style="margin: 0.35rem 0 0 0; font-weight: 600; color: var(--text-primary); font-size: 0.9rem;">
                                    📍 {order.address}
                                </p>
                                {#if order.deliveryRound}
                                    <p style="margin: 0.25rem 0 0 0; font-size: 0.8rem; color: #0284c7; font-weight: 700;">
                                        🚚 รอบส่ง: {order.deliveryRound} (วันที่ {order.deliveryDate || '-'})
                                    </p>
                                {/if}
                                {#if order.message}
                                    <p style="margin: 0.35rem 0 0 0; font-size: 0.8rem; color: var(--amber-tag); background: #fef3c7; padding: 0.3rem 0.5rem; border-radius: 6px; display: inline-block;">
                                        💬 หมายเหตุ: {order.message}
                                    </p>
                                {/if}
                                <div style="margin-top: 0.45rem;">
                                    <button
                                        type="button"
                                        onclick={() => copyOrderLineLink(order)}
                                        class="btn-matcha-outline"
                                        style="padding: 0.2rem 0.6rem; font-size: 0.72rem; border-radius: 999px; display: inline-flex; align-items: center; gap: 0.25rem;"
                                        title="คัดลอกลิงก์สำหรับส่งให้ลูกค้าใน LINE (เปิดเบราว์เซอร์ภายนอกอัตโนมัติ)"
                                    >
                                        💬 คัดลอกลิงก์ส่ง LINE
                                    </button>
                                </div>
                            </div>

                            <!-- รายการแก้วที่ต้องชง -->
                            <div>
                                <p style="margin: 0 0 0.35rem 0; font-size: 0.75rem; color: var(--text-muted);">รายการแก้วที่สั่ง (เตรียมชง)</p>
                                <div style="display: flex; flex-direction: column; gap: 0.35rem;">
                                    {#each (order.basket || []) as item}
                                        <div style="display: flex; justify-content: space-between; align-items: flex-start; font-size: 0.88rem; background: #f8fafc; padding: 0.4rem 0.6rem; border-radius: 6px; border-left: 3px solid var(--matcha-primary); gap: 0.5rem;">
                                            <div>
                                                <div>
                                                    <strong>• {item.thaiName || item.name}</strong>
                                                    <span style="color: #64748b; font-size: 0.8rem;">(หวาน {item.sweetness ?? 50}%)</span>
                                                    {#if (item.thaiName || '').includes('บ่ม')}
                                                        <span style="background: #fef08a; color: #854d0e; font-size: 0.7rem; font-weight: 800; padding: 0.1rem 0.4rem; border-radius: 4px; margin-left: 0.3rem;">เมนูบ่ม</span>
                                                    {/if}
                                                </div>
                                                {#if item.addonName}
                                                    <div style="margin-top: 0.2rem;">
                                                        <span style="display: inline-block; background: #dcfce7; color: #166534; font-size: 0.75rem; font-weight: 800; padding: 0.1rem 0.5rem; border-radius: 999px; border: 1px solid #86efac;">
                                                            🍵 + {item.addonName} (+{item.addonPrice || 0} ฿)
                                                        </span>
                                                    </div>
                                                {/if}
                                                {#if item.note}
                                                    <div style="font-size: 0.74rem; color: #475569; margin-top: 0.15rem;">
                                                        📝 โน้ต: {item.note}
                                                    </div>
                                                {/if}
                                            </div>
                                            <span style="font-weight: 800; color: var(--matcha-deep); flex-shrink: 0;">x{item.quantity}</span>
                                        </div>
                                    {/each}
                                </div>
                                <div style="display: flex; justify-content: space-between; margin-top: 0.5rem; font-weight: 700; color: var(--matcha-dark);">
                                    <span>ยอดรวม:</span>
                                    <span>{order.totalPrice} บาท</span>
                                </div>
                            </div>

                            <!-- สลิปการโอนเงิน -->
                            {#if order.slipImage}
                                <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 0.35rem;">
                                    <p style="margin: 0; font-size: 0.75rem; color: var(--text-muted);">สลิปโอนเงิน</p>
                                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                                    <div 
                                        onclick={() => (selectedSlip = order.slipImage || null)}
                                        style="cursor: pointer; position: relative; border-radius: 8px; overflow: hidden; border: 2px solid var(--border-matcha); background: #f3f4f6; min-width: 100px; min-height: 120px;"
                                    >
                                        <img 
                                            src={order.slipImage} 
                                            alt="Slip" 
                                            loading="lazy"
                                            style="width: 100px; height: 120px; object-fit: cover; display: block;" 
                                            onerror={(e) => {
                                                const el = e.currentTarget as HTMLElement;
                                                el.style.display = 'none';
                                                const fallback = el.parentElement?.querySelector('.slip-err-fallback') as HTMLElement;
                                                if (fallback) fallback.style.display = 'flex';
                                            }}
                                        />
                                        <div class="slip-err-fallback" style="display: none; width: 100px; height: 120px; flex-direction: column; align-items: center; justify-content: center; font-size: 0.7rem; color: #dc2626; text-align: center; padding: 4px; background: #fef2f2;">
                                            <span>⚠️ รูปสลิป</span>
                                            <span style="font-size: 0.65rem; text-decoration: underline; margin-top: 4px;">คลิกเพื่อเปิด</span>
                                        </div>
                                        <div style="position: absolute; inset: 0; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 0.75rem; opacity: 0; transition: opacity 0.2s;" onmouseenter={(e) => (e.currentTarget.style.opacity = '1')} onmouseleave={(e) => (e.currentTarget.style.opacity = '0')}>
                                            🔍 ขยาย
                                        </div>
                                    </div>
                                    {#if order.slipAmount !== undefined}
                                        <span style="font-size: 0.75rem; color: #166534; font-weight: 700;">
                                            ยอดตรวจพบ: {order.slipAmount.toFixed(2)} ฿
                                        </span>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    {/if}

    <!-- ======================================================== -->
    <!-- แท็บที่ 2: ปฏิทินร้าน & รอบจัดส่ง (Calendar & Settings) -->
    <!-- ======================================================== -->
    {#if activeTab === 'settings'}
        <div style="display: flex; flex-direction: column; gap: 1.75rem; width: 100%;">
            <!-- 1. สวิตช์หลัก เปิด/ปิด รับออเดอร์ทันที -->
            <div class="form-card" style="padding: 1.5rem; text-align: left;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
                    <div>
                        <h3 style="margin: 0 0 0.25rem 0; font-size: 1.25rem; color: var(--matcha-deep);">
                            🟢 สวิตช์เปิด-ปิด รับออเดอร์ของร้าน (Master Switch)
                        </h3>
                        <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted);">
                            หากปิดสวิตช์นี้ ร้านจะขึ้นแจ้งเตือนปิดรับออเดอร์ทันทีในหน้าแรก
                        </p>
                    </div>
                    <label style="display: flex; align-items: center; gap: 0.6rem; cursor: pointer; font-size: 1rem; font-weight: 700;">
                        <input 
                            type="checkbox"
                            bind:checked={settings.isMasterOpen}
                            style="width: 24px; height: 24px; accent-color: var(--matcha-primary); cursor: pointer;"
                        />
                        <span style="color: {settings.isMasterOpen ? '#166534' : '#dc2626'};">
                            {settings.isMasterOpen ? 'เปิดรับออเดอร์ตามปกติ' : 'ปิดรับออเดอร์ชั่วคราว'}
                        </span>
                    </label>
                </div>

                <div style="margin-top: 1rem;">
                    <label class="form-label" for="closedAlertMsg" style="margin-bottom: 0.35rem; display: block;">
                        ข้อความแจ้งเตือนลูกค้าเมื่อร้านปิดรับออเดอร์:
                    </label>
                    <input 
                        id="closedAlertMsg"
                        type="text" 
                        class="form-input" 
                        bind:value={settings.closedAlertMessage} 
                        placeholder="เช่น ขณะนี้ร้านปิดรับออเดอร์ชั่วคราว ขออภัยในความไม่สะดวกนะคะ"
                    />
                </div>
            </div>

            <!-- 2. ปฏิทินรายเดือน (เลือกวันเปิดขาย และปรับแต่งรายวัน) -->
            <div class="form-card" style="padding: 1.5rem; text-align: left;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1.25rem;">
                    <div>
                        <h3 style="margin: 0; font-size: 1.25rem; color: var(--matcha-deep);">
                            📅 ปฏิทินเปิดร้านรายเดือน ({thaiMonthNames[currentCalMonth]} {currentCalYear + 543})
                        </h3>
                        <p style="margin: 0.2rem 0 0 0; font-size: 0.825rem; color: var(--text-muted);">
                            คลิกที่วันเพื่อ <span style="color: #166534; font-weight: 700;">เปิด (สีเขียว)</span> หรือ <span style="color: #64748b; font-weight: 700;">ปิด (สีเทา)</span> และคลิกฟันเฟือง ⚙️ เพื่อกำหนดรอบส่งเฉพาะวัน
                        </p>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <button 
                            type="button" 
                            onclick={() => (calendarDate = new Date(currentCalYear, currentCalMonth - 1, 1))}
                            class="btn-matcha-outline"
                            style="padding: 0.4rem 0.85rem; font-size: 0.85rem;"
                        >
                            ◀ เดือนก่อนหน้า
                        </button>
                        <button 
                            type="button" 
                            onclick={() => (calendarDate = new Date(currentCalYear, currentCalMonth + 1, 1))}
                            class="btn-matcha-outline"
                            style="padding: 0.4rem 0.85rem; font-size: 0.85rem;"
                        >
                            เดือนถัดไป ▶
                        </button>
                    </div>
                </div>

                <!-- หัววันในสัปดาห์ (อาทิตย์ - เสาร์) -->
                <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.4rem; text-align: center; font-weight: 700; font-size: 0.85rem; margin-bottom: 0.4rem;">
                    <div style="color: #ef4444;">อา.</div>
                    <div style="color: #eab308;">จ.</div>
                    <div style="color: #ec4899;">อ.</div>
                    <div style="color: #16a34a;">พ.</div>
                    <div style="color: #f97316;">พฤ.</div>
                    <div style="color: #0ea5e9;">ศ.</div>
                    <div style="color: #8b5cf6;">ส.</div>
                </div>

                <!-- Grid ช่องวันในเดือน -->
                <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.4rem;">
                    {#each getCalendarMonthGrid(currentCalYear, currentCalMonth) as day}
                        {@const dayConfig = settings.calendar[day.dateStr] || { isOpen: false }}
                        {@const isOpen = Boolean(dayConfig.isOpen)}
                        {@const isAllDayMode = (dayConfig.customRounds || []).includes('allday')}
                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <div 
                            style="
                                min-height: 76px;
                                border-radius: 12px;
                                padding: 0.4rem 0.3rem;
                                display: flex;
                                flex-direction: column;
                                justify-content: space-between;
                                cursor: pointer;
                                border: 2px solid {isOpen ? (isAllDayMode ? '#8b5cf6' : '#22c55e') : '#e2e8f0'};
                                background: {isOpen ? (isAllDayMode ? '#f5f3ff' : '#f0fdf4') : day.isCurrentMonth ? '#ffffff' : '#f8fafc'};
                                opacity: {day.isCurrentMonth ? '1' : '0.45'};
                                transition: all 0.15s;
                            "
                            onclick={() => toggleDayOpen(day.dateStr)}
                            title="คลิกเพื่อสลับ เปิด/ปิด ร้านในวันนี้"
                        >
                            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                <span style="font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 0.95rem; color: {isOpen ? (isAllDayMode ? '#5b21b6' : '#166534') : '#64748b'};">
                                    {day.dayNum}
                                </span>
                                {#if isOpen}
                                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                                    <button 
                                        type="button" 
                                        onclick={(e) => { e.stopPropagation(); openEditDayModal(day.dateStr); }}
                                        style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.72rem; cursor: pointer; padding: 1px 4px; line-height: 1.2;"
                                        title="ตั้งค่ารอบส่งเฉพาะวัน"
                                    >
                                        ⚙️
                                    </button>
                                {/if}
                            </div>

                            <div style="text-align: center; margin-top: 0.15rem; display: flex; flex-direction: column; gap: 2px;">
                                {#if isOpen}
                                    <span style="display: block; font-size: 0.62rem; font-weight: 800; color: {isAllDayMode ? '#5b21b6' : '#166534'}; background: {isAllDayMode ? '#ede9fe' : '#dcfce7'}; border-radius: 4px; padding: 1px 2px;">
                                        {isAllDayMode ? '9:00-13:00' : 'เช้า/เที่ยง'}
                                    </span>
                                {:else}
                                    <span style="display: block; font-size: 0.65rem; color: #94a3b8;">
                                        ปิด
                                    </span>
                                {/if}
                            </div>
                        </div>
                    {/each}
                </div>
            </div>

            <!-- 3. ตั้งค่าระยะเวลาการสั่งล่วงหน้า (Max Advance Booking) & ปิดร้านอัตโนมัติ -->
            <div class="form-card" style="padding: 1.5rem; text-align: left; background: #ffffff; border: 1.5px solid var(--border-matcha); border-radius: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 0.75rem;">
                    <div>
                        <h3 style="margin: 0 0 0.25rem 0; font-size: 1.25rem; color: var(--matcha-deep);">
                            ⏰ กำหนดระยะเวลาการสั่งล่วงหน้า (Advance Booking Limit)
                        </h3>
                        <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted); line-height: 1.45;">
                            กำหนดว่าจะอนุญาตให้ลูกค้าสั่งล่วงหน้าได้ไม่เกินกี่วัน หรือกี่ชั่วโมงนับจากปัจจุบัน
                        </p>
                    </div>
                </div>

                <!-- ตัวเลือกรูปแบบ: รายวัน หรือ รายชั่วโมง -->
                <div style="display: flex; align-items: center; gap: 1.5rem; margin: 1rem 0; padding: 0.85rem 1rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; flex-wrap: wrap;">
                    <span style="font-size: 0.9rem; font-weight: 700; color: #334155;">รูปแบบการนับเวลา:</span>
                    <label style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.9rem; cursor: pointer; font-weight: 600;">
                        <input 
                            type="radio" 
                            name="advanceMode" 
                            value="days" 
                            checked={settings.advanceBookingMode !== 'hours'}
                            onchange={() => (settings.advanceBookingMode = 'days')}
                            style="accent-color: var(--matcha-primary); width: 18px; height: 18px;"
                        />
                        <span>📅 กำหนดเป็นจำนวนวัน (Days)</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.9rem; cursor: pointer; font-weight: 600;">
                        <input 
                            type="radio" 
                            name="advanceMode" 
                            value="hours" 
                            checked={settings.advanceBookingMode === 'hours'}
                            onchange={() => (settings.advanceBookingMode = 'hours')}
                            style="accent-color: var(--matcha-primary); width: 18px; height: 18px;"
                        />
                        <span>⏱️ กำหนดเป็นรายชั่วโมง (Hours)</span>
                    </label>
                </div>

                {#if settings.advanceBookingMode === 'hours'}
                    <!-- ช่องกรอกจำนวนชั่วโมง -->
                    <div style="margin-bottom: 1rem;">
                        <label class="form-label" for="advHoursInput" style="font-size: 0.85rem; display: block; margin-bottom: 0.35rem;">
                            สั่งล่วงหน้าได้ไม่เกินกี่ชั่วโมง (นับจากปัจจุบัน):
                        </label>
                        <div style="display: flex; align-items: center; gap: 0.75rem; max-width: 320px;">
                            <input 
                                id="advHoursInput"
                                type="number" 
                                min="1" 
                                max="336"
                                class="form-input" 
                                bind:value={settings.advanceBookingHours} 
                                style="font-size: 1.15rem; font-weight: 700; width: 130px;"
                            />
                            <span style="font-weight: 600; color: #334155;">ชั่วโมง (ประมาณ {Math.round((settings.advanceBookingHours || 72) / 24)} วัน)</span>
                        </div>
                    </div>
                {:else}
                    <!-- ช่องกรอกจำนวนวัน -->
                    <div style="margin-bottom: 1rem;">
                        <label class="form-label" for="advDaysInput" style="font-size: 0.85rem; display: block; margin-bottom: 0.35rem;">
                            สั่งล่วงหน้าได้ไม่เกินกี่วัน (นับจากวันนี้):
                        </label>
                        <div style="display: flex; align-items: center; gap: 0.75rem; max-width: 320px;">
                            <input 
                                id="advDaysInput"
                                type="number" 
                                min="1" 
                                max="14"
                                class="form-input" 
                                bind:value={settings.maxAdvanceDays} 
                                style="font-size: 1.15rem; font-weight: 700; width: 130px;"
                            />
                            <span style="font-weight: 600; color: #334155;">วัน (เช่น 3 วัน = สั่งได้ไม่เกิน 3 วันข้างหน้า)</span>
                        </div>
                    </div>
                {/if}

                <!-- ตัวเลือกบังคับจำกัดวันในดรอปดาวน์ -->
                <div style="margin: 1.25rem 0; padding: 0.9rem 1.1rem; background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 12px;">
                    <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; font-size: 0.95rem; font-weight: 700; color: #1e293b;">
                        <input 
                            type="checkbox" 
                            bind:checked={settings.limitDropdownToAdvanceWindow}
                            style="width: 22px; height: 22px; accent-color: var(--matcha-primary); cursor: pointer;"
                        />
                        <span>☑️ บังคับจำกัดวันในดรอปดาวน์หน้าสั่งซื้อ ให้เหลือเฉพาะตามจำนวนวัน/ชั่วโมงที่ตั้ง</span>
                    </label>
                    <p style="margin: 0.4rem 0 0 2.2rem; font-size: 0.825rem; color: var(--text-muted); line-height: 1.4;">
                        เมื่อเปิดใช้งาน: ดรอปดาวน์เลือกวันจัดส่งของลูกค้าจะตัดวันที่เกินกำหนด (เช่น เกิน 3 วัน) ออกไปทันที ไม่แสดงให้เลือก
                    </p>
                </div>

                <!-- กล่องคำอธิบายกฎการทำงานอัจฉริยะ -->
                <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 0.9rem 1rem; color: #166534; font-size: 0.84rem; line-height: 1.5;">
                    <div style="font-weight: 700; margin-bottom: 0.25rem; display: flex; align-items: center; gap: 0.35rem;">
                        <span>💡 ระบบควบคุมสถานะร้านและการสั่งล่วงหน้าอัตโนมัติ:</span>
                    </div>
                    <ul style="margin: 0; padding-left: 1.25rem;">
                        <li><strong>เมื่อเลยเวลาส่งของทุกรอบในวันนี้:</strong> หน้าแรกจะเปลี่ยนป้ายสถานะเป็น <em>"🟠 ปิดรับรอบวันนี้แล้ว · สั่งล่วงหน้าได้"</em> อัตโนมัติ (และหน้าสั่งจะข้ามไปเลือกวันถัดไปทันที)</li>
                        <li><strong>หากร้านปิดยาวเกินระยะเวลาที่กำหนดสั่งล่วงหน้า (เช่น ปิดทุกวันใน {settings.advanceBookingMode === 'hours' ? settings.advanceBookingHours + ' ชม.' : (settings.maxAdvanceDays || 3) + ' วัน'}):</strong> หน้าแรกจะขึ้นป้าย <em>"🔴 ขณะนี้ร้านยังไม่เปิดรับออเดอร์"</em> และล็อกปุ่มสั่งอัตโนมัติ</li>
                    </ul>
                </div>
            </div>

            <!-- 4. ตั้งค่าช่วงเวลาในการส่ง (Delivery Rounds) & กฎเวลาตัดรอบ -->
            <div class="form-card" style="padding: 1.5rem; text-align: left;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1rem;">
                    <div>
                        <h3 style="margin: 0; font-size: 1.25rem; color: var(--matcha-deep);">
                            🚚 ตั้งค่าช่วงเวลาในการส่ง (Delivery Rounds)
                        </h3>
                        <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted);">
                            แก้ไขช่วงเวลาจัดส่ง และเวลาตัดรอบรับออเดอร์ของแต่ละรอบ
                        </p>
                    </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    {#each settings.deliveryRounds as round, idx}
                        <div style="background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 14px; padding: 1.25rem;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                                <strong style="font-size: 1rem; color: var(--matcha-deep);">
                                    รอบที่ {idx + 1}: {round.name}
                                </strong>
                                <label style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; cursor: pointer;">
                                    <input type="checkbox" bind:checked={round.enabled} style="width: 16px; height: 16px; accent-color: var(--matcha-primary);" />
                                    <span>เปิดใช้งานรอบนี้</span>
                                </label>
                            </div>

                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.85rem;">
                                <div>
                                    <label class="form-label" style="font-size: 0.8rem;" for="roundName{idx}">ชื่อรอบส่ง:</label>
                                    <input id="roundName{idx}" type="text" class="form-input" bind:value={round.name} placeholder="เช่น รอบเช้า" />
                                </div>
                                <div>
                                    <label class="form-label" style="font-size: 0.8rem;" for="timeSlot{idx}">ช่วงเวลาที่จัดส่ง (ลูกค้าจะเห็นเวลานี้):</label>
                                    <input id="timeSlot{idx}" type="text" class="form-input" bind:value={round.timeSlot} placeholder="เช่น 07:00–08:00 น." />
                                </div>
                                <div>
                                    <label class="form-label" style="font-size: 0.8rem;" for="cutoffTime{idx}">เวลาตัดรอบรับออเดอร์ในวันส่ง:</label>
                                    <input id="cutoffTime{idx}" type="text" class="form-input" bind:value={round.cutoffTime} placeholder="เช่น 06:00" />
                                </div>
                                <div style="display: flex; align-items: center; margin-top: 1.25rem;">
                                    <label style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; cursor: pointer;">
                                        <input type="checkbox" bind:checked={round.allowFermented} style="width: 16px; height: 16px; accent-color: var(--matcha-primary);" />
                                        <span>อนุญาตให้ส่งเมนูบ่มสกัดเย็นในรอบนี้</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    {/each}
                </div>
            </div>

            <!-- 5. ตั้งค่ากฎเวลาตัดรอบสำหรับ "เมนูบ่ม" (Fermented Matcha) -->
            <div class="form-card" style="padding: 1.5rem; text-align: left;">
                <h3 style="margin: 0 0 0.35rem 0; font-size: 1.25rem; color: var(--matcha-deep);">
                    🍵 กฎเฉพาะสำหรับ "เมนูบ่มสกัดเย็น"
                </h3>
                <p style="margin: 0 0 1rem 0; font-size: 0.85rem; color: var(--text-muted);">
                    เมนูบ่มต้องสั่งล่วงหน้าก่อนเวลาที่กำหนดของวันก่อนเปิดร้าน (หากสั่งทันก่อนเวลาตัดรอบ สามารถเลือกส่งได้ทั้งรอบเช้า รอบบ่าย/เที่ยง หรือวันถัด ๆ ไป แต่หากเลยเวลาตัดรอบ จะสั่งส่งวันถัดไปได้เฉพาะเมนูไม่บ่ม)
                </p>

                <div style="margin-bottom: 1.25rem;">
                    <label class="form-label" style="font-size: 0.85rem; display: block; margin-bottom: 0.35rem;" for="fermentedCutoff">
                        เวลาตัดรอบเมนูบ่ม (ในวันก่อนหน้าวันส่ง):
                    </label>
                    <div style="display: flex; align-items: center; gap: 0.5rem; max-width: 250px;">
                        <input 
                            id="fermentedCutoff"
                            type="text" 
                            class="form-input" 
                            bind:value={settings.fermentedCutoffTime} 
                            placeholder="23:00" 
                            style="font-size: 1.1rem; font-weight: 700;"
                        />
                        <span>น.</span>
                    </div>
                </div>

                <div>
                    <label class="form-label" style="font-size: 0.85rem; display: block; margin-bottom: 0.5rem;" for="fermentedDrinkGroup">
                        เลือกเมนูที่เข้าข่ายเป็น "เมนูบ่ม" (มีผลบังคับใช้กฎข้างต้น):
                    </label>
                    <div style="display: flex; flex-direction: column; gap: 0.5rem;" id="fermentedDrinkGroup">
                        {#each availableDrinks as drink}
                            <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; cursor: pointer;">
                                <input 
                                    type="checkbox"
                                    checked={settings.fermentedItemIds.includes(drink.id)}
                                    onchange={(e) => {
                                        if ((e.target as HTMLInputElement).checked) {
                                            settings.fermentedItemIds = [...settings.fermentedItemIds, drink.id];
                                        } else {
                                            settings.fermentedItemIds = settings.fermentedItemIds.filter(id => id !== drink.id);
                                        }
                                    }}
                                    style="width: 18px; height: 18px; accent-color: var(--matcha-primary);"
                                />
                                <span>{drink.name}</span>
                            </label>
                        {/each}
                    </div>
                </div>
            </div>

            <!-- ปุ่มบันทึกการตั้งค่าทั้งหมด -->
            <div style="position: sticky; bottom: 1.5rem; z-index: 1000; width: 100%; display: flex; justify-content: flex-end;">
                <button 
                    type="button" 
                    onclick={saveAllSettings} 
                    class="btn-matcha-primary" 
                    style="padding: 1rem 2.5rem; font-size: 1.15rem; font-weight: 800; border-radius: 999px; box-shadow: 0 10px 30px rgba(52, 84, 39, 0.4);"
                    disabled={isSavingSettings}
                >
                    💾 {isSavingSettings ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่าร้านและปฏิทินทั้งหมด'}
                </button>
            </div>
        </div>
    {/if}

    <!-- ========================================== -->
    <!-- 👥 TAB 3: จัดการสมาชิก & แต้มสะสม (LOYALTY) -->
    <!-- ========================================== -->
    {#if activeTab === 'members'}
        <div style="display: flex; flex-direction: column; gap: 1.5rem; text-align: left;">
            <!-- การตั้งค่าระบบสะสมแต้มแบบ Dynamic -->
            <div class="info-card" style="padding: 1.5rem; border: 2px solid {settings.loyaltyEnabled !== false ? '#bbf7d0' : '#fecaca'}; background: {settings.loyaltyEnabled !== false ? '#f0fdf4' : '#fef2f2'}; transition: all 0.2s ease;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem;">
                    <div>
                        <h3 style="margin: 0 0 0.25rem 0; color: {settings.loyaltyEnabled !== false ? '#166534' : '#991b1b'}; font-size: 1.15rem;">
                            🍵 ตั้งค่าระบบบัตรสะสมแต้ม (Dynamic Loyalty Settings)
                        </h3>
                        <p style="margin: 0; font-size: 0.85rem; color: {settings.loyaltyEnabled !== false ? '#15803d' : '#b91c1c'};">
                            แต้มจะถูกบันทึกอัตโนมัติเมื่อแอดมินกดยืนยันสถานะออเดอร์เป็น <strong>"จัดส่งสำเร็จ"</strong> (1 แก้ว = 1 ดวง)
                        </p>
                    </div>
                    <button
                        type="button"
                        onclick={saveAllSettings}
                        class="btn-matcha-primary"
                        style="padding: 0.6rem 1.25rem; font-size: 0.9rem; border-radius: 999px;"
                        disabled={isSavingSettings}
                    >
                        💾 {isSavingSettings ? 'กำลังบันทึก...' : 'บันทึกตั้งค่าแต้มสะสม'}
                    </button>
                </div>

                <!-- 🟢 สวิตช์หลัก เปิด-ปิด ระบบสะสมแต้ม (Loyalty Master Toggle) -->
                <div style="background: #ffffff; padding: 1rem 1.15rem; border-radius: 14px; border: 1.5px solid {settings.loyaltyEnabled !== false ? '#86efac' : '#fca5a5'}; margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.85rem;">
                    <div>
                        <div style="font-size: 1rem; font-weight: 800; color: {settings.loyaltyEnabled !== false ? '#14532d' : '#991b1b'}; display: flex; align-items: center; gap: 0.4rem;">
                            <span>{settings.loyaltyEnabled !== false ? '🟢' : '🔴'}</span>
                            <span>สวิตช์เปิด-ปิด ระบบสะสมแต้มและสมาชิก (Master Toggle)</span>
                        </div>
                        <div style="font-size: 0.8rem; color: #64748b; margin-top: 0.2rem;">
                            หากปิดสวิตช์นี้ ปุ่มวงกลมสมาชิก หน้าบัตรสะสมแต้ม การแจกแต้มอัตโนมัติ และการแลกแก้วฟรีหน้าชำระเงินจะถูกซ่อนและระงับชั่วคราวทันที
                        </div>
                    </div>

                    <label style="display: inline-flex; align-items: center; gap: 0.65rem; cursor: pointer; background: {settings.loyaltyEnabled !== false ? '#dcfce7' : '#fee2e2'}; border: 1.5px solid {settings.loyaltyEnabled !== false ? '#22c55e' : '#ef4444'}; padding: 0.5rem 1rem; border-radius: 999px; font-size: 0.92rem; font-weight: 800; transition: all 0.15s ease;">
                        <input
                            type="checkbox"
                            bind:checked={settings.loyaltyEnabled}
                            onchange={handleToggleLoyaltyMaster}
                            style="width: 20px; height: 20px; accent-color: #16a34a; cursor: pointer;"
                        />
                        <span style="color: {settings.loyaltyEnabled !== false ? '#166534' : '#dc2626'};">
                            {settings.loyaltyEnabled !== false ? 'เปิดใช้งานระบบสะสมแต้ม' : 'ปิดระบบสะสมแต้มชั่วคราว'}
                        </span>
                    </label>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem;">
                    <div style="background: #ffffff; padding: 1rem; border-radius: 14px; border: 1px solid #dcfce7;">
                        <label class="form-label" style="font-size: 0.85rem; color: #166534;" for="loyaltyReqInput">
                            🎯 จำนวนแก้วที่ต้องสะสมเพื่อแลกฟรี 1 แก้ว:
                        </label>
                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.35rem;">
                            <input
                                id="loyaltyReqInput"
                                type="number"
                                min="2"
                                max="30"
                                class="form-input"
                                bind:value={settings.loyaltyStampsRequired}
                                style="font-size: 1.1rem; font-weight: 800; max-width: 110px;"
                            />
                            <span style="font-weight: 700; color: #166534;">ดวง (ค่าเริ่มต้น 10 ดวง)</span>
                        </div>
                    </div>

                    <div style="background: #ffffff; padding: 1rem; border-radius: 14px; border: 1px solid #dcfce7;">
                        <label class="form-label" style="font-size: 0.85rem; color: #166534;" for="loyaltyExpInput">
                            ⏳ อายุบัตรสะสมแต้ม (นับตั้งแต่ซื้อแก้วแรก):
                        </label>
                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.35rem;">
                            <input
                                id="loyaltyExpInput"
                                type="number"
                                min="1"
                                max="365"
                                class="form-input"
                                bind:value={settings.loyaltyExpireDays}
                                style="font-size: 1.1rem; font-weight: 800; max-width: 110px;"
                            />
                            <span style="font-weight: 700; color: #166534;">วัน (ค่าเริ่มต้น 60 วัน)</span>
                        </div>
                    </div>
                </div>

                <!-- 🎁 เลือกเมนูที่อนุญาตให้แลกฟรีด้วยแต้มสะสม -->
                <div style="margin-top: 1rem; background: #ffffff; padding: 1rem; border-radius: 14px; border: 1px solid #dcfce7;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.6rem;">
                        <div>
                            <div style="font-size: 0.9rem; font-weight: 800; color: #166534;">
                                🎁 เลือกเมนูที่อนุญาตให้แลกฟรีด้วยแต้มสะสม:
                            </div>
                            <div style="font-size: 0.78rem; color: #15803d;">
                                ลูกค้าจะสามารถกดใช้สิทธิ์แลกแก้วฟรีได้เฉพาะเมื่อมีเมนูที่ติ๊กเลือกไว้อยู่ในตะกร้าเท่านั้น
                            </div>
                        </div>
                        <div style="display: flex; gap: 0.4rem;">
                            <button
                                type="button"
                                onclick={() => {
                                    settings.loyaltyRedeemableItemIds = availableDrinks.map((d) => d.id);
                                }}
                                style="background: #dcfce7; color: #166534; border: 1px solid #86efac; border-radius: 999px; padding: 0.25rem 0.7rem; font-size: 0.75rem; font-weight: 700; cursor: pointer;"
                            >
                                ✓ เลือกทุกเมนู
                            </button>
                            <button
                                type="button"
                                onclick={() => {
                                    settings.loyaltyRedeemableItemIds = [];
                                }}
                                style="background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; border-radius: 999px; padding: 0.25rem 0.7rem; font-size: 0.75rem; font-weight: 700; cursor: pointer;"
                            >
                                ล้างการเลือก
                            </button>
                        </div>
                    </div>

                    <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                        {#each availableDrinks as drink}
                            {@const isChecked = (settings.loyaltyRedeemableItemIds || []).includes(drink.id)}
                            <label
                                style="display: inline-flex; align-items: center; gap: 0.45rem; background: {isChecked ? '#dcfce7' : '#f8fafc'}; border: 1.5px solid {isChecked ? '#22c55e' : '#e2e8f0'}; padding: 0.45rem 0.85rem; border-radius: 999px; font-size: 0.85rem; font-weight: {isChecked ? '800' : '600'}; color: {isChecked ? '#14532d' : '#475569'}; cursor: pointer; transition: all 0.15s ease;"
                            >
                                <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onchange={(e) => {
                                        const checked = (e.target as HTMLInputElement).checked;
                                        const currentList = settings.loyaltyRedeemableItemIds || [];
                                        if (checked) {
                                            if (!currentList.includes(drink.id)) {
                                                settings.loyaltyRedeemableItemIds = [...currentList, drink.id];
                                            }
                                        } else {
                                            settings.loyaltyRedeemableItemIds = currentList.filter((id) => id !== drink.id);
                                        }
                                    }}
                                    style="accent-color: #16a34a; width: 16px; height: 16px; cursor: pointer;"
                                />
                                <span>{drink.name}</span>
                            </label>
                        {/each}
                    </div>
                </div>
            </div>

            <!-- รายชื่อสมาชิกทั้งหมด -->
            <div class="info-card admin-section-card" style="padding: 1.5rem;">
                <div class="admin-members-toolbar">
                    <h3 style="margin: 0; color: var(--matcha-deep); font-size: 1.15rem;">
                        👥 รายชื่อสมาชิกทั้งหมด ({filteredMembers.length} คน)
                    </h3>
                    <div class="admin-members-search-box">
                        <input
                            type="text"
                            class="form-input"
                            placeholder="🔍 ค้นหาชื่อ หรือ เบอร์โทร..."
                            bind:value={memberSearchQuery}
                            style="padding: 0.5rem 0.85rem; font-size: 0.9rem;"
                        />
                        <button
                            type="button"
                            onclick={loadMembers}
                            class="btn-matcha-outline"
                            style="padding: 0.5rem 1rem; font-size: 0.85rem; white-space: nowrap;"
                        >
                            🔄 รีเฟรช
                        </button>
                    </div>
                </div>

                {#if filteredMembers.length === 0}
                    <div style="text-align: center; padding: 2.5rem 1rem; color: #64748b;">
                        ยังไม่มีข้อมูลสมาชิกที่ค้นหา
                    </div>
                {:else}
                    <!-- ตารางสำหรับหน้าจอ Desktop -->
                    <div class="admin-members-desktop-table" style="overflow-x: auto;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                            <thead>
                                <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0; text-align: left;">
                                    <th style="padding: 0.75rem;">ชื่อ-นามสกุล</th>
                                    <th style="padding: 0.75rem;">เบอร์โทรศัพท์</th>
                                    <th style="padding: 0.75rem;">แต้มสะสมปัจจุบัน</th>
                                    <th style="padding: 0.75rem;">วันหมดอายุบัตร</th>
                                    <th style="padding: 0.75rem;">สะสมรวม / แลกฟรีแล้ว</th>
                                    <th style="padding: 0.75rem; text-align: right;">จัดการแต้ม & ข้อมูล</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each filteredMembers as member}
                                    {@const reqStamps = Number(settings.loyaltyStampsRequired) || 10}
                                    {@const canRedeem = Number(member.points || 0) >= reqStamps}
                                    {@const isExpired = member.cardExpiresAt && new Date(member.cardExpiresAt).getTime() < Date.now()}
                                    <tr style="border-bottom: 1px solid #f1f5f9;">
                                        <td style="padding: 0.85rem 0.75rem; font-weight: 700; color: #1e293b;">
                                            {member.fullName}
                                        </td>
                                        <td style="padding: 0.85rem 0.75rem; font-family: monospace; font-size: 0.95rem; font-weight: 700; color: #334155;">
                                            {member.phone}
                                        </td>
                                        <td style="padding: 0.85rem 0.75rem;">
                                            <div style="display: inline-flex; align-items: center; gap: 0.4rem;">
                                                <button
                                                    type="button"
                                                    onclick={() => adjustMemberPoints(member, -1)}
                                                    style="width: 28px; height: 28px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; font-weight: 800;"
                                                    title="ลด 1 แต้ม"
                                                >-</button>
                                                <span style="padding: 0.25rem 0.7rem; border-radius: 999px; font-weight: 800; white-space: nowrap; background: {canRedeem ? '#dcfce7' : '#f1f5f9'}; color: {canRedeem ? '#166534' : '#334155'};">
                                                    🍵 {member.points} / {reqStamps}
                                                </span>
                                                <button
                                                    type="button"
                                                    onclick={() => adjustMemberPoints(member, 1)}
                                                    style="width: 28px; height: 28px; border-radius: 8px; border: 1px solid #86efac; background: #f0fdf4; color: #166534; cursor: pointer; font-weight: 800;"
                                                    title="เพิ่ม 1 แต้ม"
                                                >+</button>
                                            </div>
                                        </td>
                                        <td style="padding: 0.85rem 0.75rem; font-size: 0.84rem;">
                                            {#if member.cardExpiresAt}
                                                <span style="color: {isExpired ? '#dc2626' : '#475569'}; font-weight: 600;">
                                                    {new Date(member.cardExpiresAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                    {#if isExpired}
                                                        <span style="color: #dc2626; font-weight: 800;">(หมดอายุ)</span>
                                                    {/if}
                                                </span>
                                            {:else}
                                                <span style="color: #94a3b8;">ยังไม่เริ่มนับ (รอซื้อแก้วแรก)</span>
                                            {/if}
                                        </td>
                                        <td style="padding: 0.85rem 0.75rem; font-size: 0.84rem; color: #475569;">
                                            <span style="font-weight: 700; color: #166534;">รวม {member.totalStampsEarned ?? 0} แก้ว</span>
                                            ·
                                            <span style="font-weight: 700; color: #b45309;">แลกฟรี {member.totalFreeRedeemed ?? 0} ครั้ง</span>
                                        </td>
                                        <td style="padding: 0.85rem 0.75rem; text-align: right;">
                                            <div style="display: inline-flex; gap: 0.4rem; flex-wrap: wrap; justify-content: flex-end;">
                                                {#if canRedeem}
                                                    <button
                                                        type="button"
                                                        onclick={() => redeemMemberFreeCupByAdmin(member)}
                                                        style="padding: 0.35rem 0.7rem; border-radius: 8px; border: none; background: #16a34a; color: #fff; font-size: 0.78rem; font-weight: 700; cursor: pointer;"
                                                    >
                                                        🎁 ตัดแต้มแลกฟรี
                                                    </button>
                                                {/if}
                                                <button
                                                    type="button"
                                                    onclick={() => openEditMemberModal(member)}
                                                    style="padding: 0.35rem 0.7rem; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: #334155; font-size: 0.78rem; font-weight: 700; cursor: pointer;"
                                                >
                                                    ✏️ แก้ไข
                                                </button>
                                                <button
                                                    type="button"
                                                    onclick={() => deleteMember(member)}
                                                    style="padding: 0.35rem 0.6rem; border-radius: 8px; border: 1px solid #fecdd3; background: #fff1f2; color: #e11d48; font-size: 0.78rem; font-weight: 700; cursor: pointer;"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>

                    <!-- การ์ดสมาชิกสำหรับหน้าจอมือถือ (Mobile Responsive Cards) -->
                    <div class="admin-members-mobile-list">
                        {#each filteredMembers as member}
                            {@const reqStamps = Number(settings.loyaltyStampsRequired) || 10}
                            {@const canRedeem = Number(member.points || 0) >= reqStamps}
                            {@const isExpired = member.cardExpiresAt && new Date(member.cardExpiresAt).getTime() < Date.now()}
                            <div class="admin-member-mobile-card">
                                <div class="member-mcard-top">
                                    <div>
                                        <div style="font-weight: 800; font-size: 1rem; color: #1e293b;">คุณ {member.fullName}</div>
                                        <div style="font-family: monospace; font-size: 0.9rem; font-weight: 700; color: #475569;">📱 {member.phone}</div>
                                    </div>
                                    <div style="display: inline-flex; align-items: center; gap: 0.35rem;">
                                        <button
                                            type="button"
                                            onclick={() => adjustMemberPoints(member, -1)}
                                            style="width: 30px; height: 30px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; font-weight: 800;"
                                        >-</button>
                                        <span style="padding: 0.28rem 0.7rem; border-radius: 999px; font-weight: 800; font-size: 0.85rem; white-space: nowrap; background: {canRedeem ? '#dcfce7' : '#f1f5f9'}; color: {canRedeem ? '#166534' : '#334155'};">
                                            🍵 {member.points}/{reqStamps}
                                        </span>
                                        <button
                                            type="button"
                                            onclick={() => adjustMemberPoints(member, 1)}
                                            style="width: 30px; height: 30px; border-radius: 8px; border: 1px solid #86efac; background: #f0fdf4; color: #166534; cursor: pointer; font-weight: 800;"
                                        >+</button>
                                    </div>
                                </div>

                                <div class="member-mcard-stats">
                                    <span class="mcard-stat-pill">🍵 สะสมรวม: <strong>{member.totalStampsEarned ?? 0} แก้ว</strong></span>
                                    <span class="mcard-stat-pill">🎁 แลกฟรีแล้ว: <strong>{member.totalFreeRedeemed ?? 0} ครั้ง</strong></span>
                                </div>

                                <div style="font-size: 0.8rem; color: #475569;">
                                    ⏳ วันหมดอายุบัตร:
                                    {#if member.cardExpiresAt}
                                        <strong style="color: {isExpired ? '#dc2626' : '#1e293b'};">
                                            {new Date(member.cardExpiresAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                                            {isExpired ? '(หมดอายุ)' : ''}
                                        </strong>
                                    {:else}
                                        <span style="color: #94a3b8;">รอซื้อแก้วแรก</span>
                                    {/if}
                                </div>

                                <div class="member-mcard-actions">
                                    {#if canRedeem}
                                        <button
                                            type="button"
                                            onclick={() => redeemMemberFreeCupByAdmin(member)}
                                            style="flex: 1; padding: 0.48rem 0.75rem; border-radius: 10px; border: none; background: #16a34a; color: #fff; font-size: 0.8rem; font-weight: 700; cursor: pointer;"
                                        >
                                            🎁 ตัดแต้มแลกฟรี
                                        </button>
                                    {/if}
                                    <button
                                        type="button"
                                        onclick={() => openEditMemberModal(member)}
                                        style="flex: 1; padding: 0.48rem 0.75rem; border-radius: 10px; border: 1px solid #cbd5e1; background: #fff; color: #334155; font-size: 0.8rem; font-weight: 700; cursor: pointer;"
                                    >
                                        ✏️ แก้ไขข้อมูล
                                    </button>
                                    <button
                                        type="button"
                                        onclick={() => deleteMember(member)}
                                        style="padding: 0.48rem 0.75rem; border-radius: 10px; border: 1px solid #fecdd3; background: #fff1f2; color: #e11d48; font-size: 0.8rem; font-weight: 700; cursor: pointer;"
                                    >
                                        🗑️ ลบ
                                    </button>
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>
    {/if}

    <!-- ========================================== -->
    <!-- 🧋 TAB 4: จัดการเมนู & หมวดหมู่เครื่องดื่ม -->
    <!-- ========================================== -->
    {#if activeTab === 'menus'}
        <div style="display: flex; flex-direction: column; gap: 1.5rem; text-align: left;">
            <!-- หมวดหมู่เครื่องดื่ม -->
            <div class="info-card admin-section-card" style="padding: 1.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem;">
                    <div>
                        <h3 style="margin: 0 0 0.2rem 0; color: var(--matcha-deep); font-size: 1.15rem;">
                            🗂️ หมวดหมู่เครื่องดื่ม (Categories)
                        </h3>
                        <p style="margin: 0; font-size: 0.84rem; color: var(--text-muted);">
                            จัดการหมวดหมู่สำหรับแสดงแถบกรองในหน้าเมนู
                        </p>
                    </div>
                    <button
                        type="button"
                        onclick={openAddCategoryModal}
                        class="btn-matcha-outline"
                        style="padding: 0.5rem 1rem; font-size: 0.88rem; font-weight: 700;"
                    >
                        ➕ เพิ่มหมวดหมู่ใหม่
                    </button>
                </div>

                <div style="display: flex; flex-wrap: wrap; gap: 0.65rem;">
                    {#each menuCategories as cat}
                        <div style="display: inline-flex; align-items: center; gap: 0.6rem; padding: 0.55rem 0.95rem; border-radius: 12px; background: #f8fafc; border: 1px solid #e2e8f0;">
                            <span style="font-size: 1.1rem;">{cat.icon || '🍵'}</span>
                            <div>
                                <div style="font-weight: 700; font-size: 0.9rem; color: #1e293b;">{cat.name}</div>
                                <div style="font-size: 0.72rem; color: #64748b;">รหัส: {cat.id} · ลำดับ {cat.sortOrder}</div>
                            </div>
                            <button
                                type="button"
                                onclick={() => openEditCategoryModal(cat)}
                                style="border: none; background: #e2e8f0; border-radius: 6px; padding: 0.2rem 0.45rem; font-size: 0.75rem; cursor: pointer;"
                                title="แก้ไขหมวดหมู่"
                            >✏️</button>
                            <button
                                type="button"
                                onclick={() => handleDeleteCategory(cat)}
                                style="border: none; background: #fee2e2; color: #b91c1c; border-radius: 6px; padding: 0.2rem 0.45rem; font-size: 0.75rem; cursor: pointer;"
                                title="ลบหมวดหมู่"
                            >✕</button>
                        </div>
                    {/each}
                </div>
            </div>

            <!-- รายการเมนูเครื่องดื่มทั้งหมด -->
            <div class="info-card admin-section-card" style="padding: 1.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.25rem;">
                    <div>
                        <h3 style="margin: 0 0 0.2rem 0; color: var(--matcha-deep); font-size: 1.15rem;">
                            🧋 รายการเมนูเครื่องดื่มทั้งหมด ({menuItems.length} เมนู)
                        </h3>
                        <p style="margin: 0; font-size: 0.84rem; color: var(--text-muted);">
                            เพิ่ม/แก้ไขราคา รูปภาพ คำอธิบาย ตั้งค่า Promo, Signature และเมนูบ่มได้ทันที
                        </p>
                    </div>
                    <button
                        type="button"
                        onclick={openAddMenuModal}
                        class="btn-matcha-primary"
                        style="padding: 0.65rem 1.35rem; font-size: 0.92rem; font-weight: 800; border-radius: 999px;"
                    >
                        ➕ เพิ่มเมนูเครื่องดื่มใหม่
                    </button>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1.15rem;">
                    {#each menuItems as item}
                        <div style="border: 1.5px solid {item.isAvailable ? '#e2e8f0' : '#fecdd3'}; border-radius: 18px; overflow: hidden; background: {item.isAvailable ? '#ffffff' : '#fff1f2'}; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 4px 14px rgba(0,0,0,0.04);">
                            <div>
                                <div style="position: relative; height: 180px; background: #f1f5f9; overflow: hidden;">
                                    <img
                                        src={item.imageUrl || `/image/${item.id}.jpg`}
                                        alt={item.thaiName}
                                        style="width: 100%; height: 100%; object-fit: cover;"
                                    />
                                    <div style="position: absolute; top: 8px; left: 8px; display: flex; flex-wrap: wrap; gap: 4px;">
                                        {#if item.isSignature}
                                            <span style="background: #166534; color: #fff; font-size: 0.7rem; font-weight: 800; padding: 0.2rem 0.55rem; border-radius: 999px;">
                                                ⭐ SIGNATURE
                                            </span>
                                        {/if}
                                        {#if item.isPromotion}
                                            <span style="background: #d97706; color: #fff; font-size: 0.7rem; font-weight: 800; padding: 0.2rem 0.55rem; border-radius: 999px;">
                                                🔥 PROMO
                                            </span>
                                        {/if}
                                        {#if item.isFermented}
                                            <span style="background: #7c3aed; color: #fff; font-size: 0.7rem; font-weight: 800; padding: 0.2rem 0.55rem; border-radius: 999px;">
                                                ⏳ เมนูบ่ม
                                            </span>
                                        {/if}
                                        {#if !item.isAvailable}
                                            <span style="background: #dc2626; color: #fff; font-size: 0.7rem; font-weight: 800; padding: 0.2rem 0.55rem; border-radius: 999px;">
                                                ⛔ ปิดจำหน่ายชั่วคราว
                                            </span>
                                        {/if}
                                    </div>
                                    <div style="position: absolute; bottom: 8px; right: 8px; background: rgba(15, 23, 42, 0.85); color: #fff; font-weight: 800; font-size: 0.95rem; padding: 0.25rem 0.7rem; border-radius: 999px;">
                                        {item.price} ฿
                                    </div>
                                </div>

                                <div style="padding: 1rem;">
                                    <div style="font-size: 0.72rem; font-weight: 700; color: #64748b; text-transform: uppercase;">
                                        {item.englishName} · หมวด: {item.category}
                                    </div>
                                    <h4 style="margin: 0.2rem 0 0.4rem 0; font-size: 1.05rem; color: #1e293b;">
                                        {item.thaiName}
                                    </h4>
                                    <p style="margin: 0 0 0.5rem 0; font-size: 0.82rem; color: #475569; line-height: 1.45;">
                                        {item.description || '-'}
                                    </p>
                                    {#if item.notes}
                                        <div style="font-size: 0.75rem; color: #166534; background: #f0fdf4; padding: 0.35rem 0.6rem; border-radius: 8px;">
                                            🍃 {item.notes}
                                        </div>
                                    {/if}
                                    {#if item.addons && item.addons.length > 0}
                                        <div style="margin-top: 0.45rem; display: flex; flex-wrap: wrap; gap: 0.3rem;">
                                            {#each item.addons as addon}
                                                <span style="background: #dcfce7; color: #14532d; border: 1px solid #86efac; font-size: 0.72rem; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 999px;">
                                                    🍵 {addon.name} (+{addon.price}฿)
                                                </span>
                                            {/each}
                                        </div>
                                    {/if}
                                </div>
                            </div>

                            <div style="padding: 0.75rem 1rem; border-top: 1px solid #f1f5f9; display: flex; gap: 0.5rem;">
                                <button
                                    type="button"
                                    onclick={() => openEditMenuModal(item)}
                                    class="btn-matcha-outline"
                                    style="flex: 1; padding: 0.45rem; font-size: 0.84rem; font-weight: 700;"
                                >
                                    ✏️ แก้ไขเมนู
                                </button>
                                <button
                                    type="button"
                                    onclick={() => handleDeleteMenuItem(item)}
                                    style="padding: 0.45rem 0.75rem; border-radius: 10px; border: 1px solid #fecdd3; background: #fff1f2; color: #e11d48; font-size: 0.84rem; font-weight: 700; cursor: pointer;"
                                >
                                    🗑️ ลบ
                                </button>
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        </div>
    {/if}

    <!-- ➕ Modal เพิ่มออเดอร์/แก้วเข้าคิวด้วยตนเอง (สำหรับแอดมิน) -->
    {#if showCreateOrderModal}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.65); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 99999; padding: 1rem; overflow-y: auto;"
            onclick={() => (showCreateOrderModal = false)}
        >
            <div
                style="background: #ffffff; border-radius: 24px; max-width: 680px; width: 100%; padding: 1.5rem 1.75rem; text-align: left; box-shadow: 0 25px 60px rgba(0,0,0,0.3); max-height: 92vh; overflow-y: auto;"
                onclick={(e) => e.stopPropagation()}
            >
                <!-- Modal Header -->
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.25rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.85rem;">
                    <div>
                        <h3 style="margin: 0; font-size: 1.3rem; color: #14532d; font-weight: 800; display: flex; align-items: center; gap: 0.5rem;">
                            <span>➕ เพิ่มออเดอร์ / แก้วเข้าคิวชง</span>
                        </h3>
                        <p style="margin: 0.25rem 0 0 0; font-size: 0.82rem; color: #64748b;">
                            สร้างออเดอร์สำหรับลูกค้าหน้าร้าน หรือเลือกสมาชิกสะสมแต้มโดยตรง
                        </p>
                    </div>
                    <button
                        type="button"
                        onclick={() => (showCreateOrderModal = false)}
                        style="background: #f1f5f9; border: none; border-radius: 50%; width: 34px; height: 34px; font-size: 1.1rem; color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: center;"
                    >
                        ✕
                    </button>
                </div>

                <div style="display: flex; flex-direction: column; gap: 1.2rem;">
                    <!-- 1. หมวดเลือกลูกค้า / สมาชิก -->
                    <div style="background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 16px; padding: 1rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
                            <span style="font-weight: 800; font-size: 0.92rem; color: #1e293b; display: flex; align-items: center; gap: 0.4rem;">
                                👤 1. ข้อมูลลูกค้า / สมาชิก
                            </span>
                            <!-- แท็บเลือกประเภท: สมาชิก vs ทั่วไป -->
                            <div style="display: flex; background: #e2e8f0; border-radius: 999px; padding: 2px;">
                                <button
                                    type="button"
                                    onclick={() => { createOrderMode = 'member'; }}
                                    style="border: none; border-radius: 999px; padding: 0.25rem 0.75rem; font-size: 0.78rem; font-weight: 700; cursor: pointer; transition: all 0.15s; {createOrderMode === 'member' ? 'background: #166534; color: #fff;' : 'background: transparent; color: #475569;'}"
                                >
                                    👥 สมาชิกสะสมแต้ม
                                </button>
                                <button
                                    type="button"
                                    onclick={() => { createOrderMode = 'guest'; clearSelectedMemberForOrder(); newOrderName = 'ลูกค้าทั่วไป (Walk-in)'; }}
                                    style="border: none; border-radius: 999px; padding: 0.25rem 0.75rem; font-size: 0.78rem; font-weight: 700; cursor: pointer; transition: all 0.15s; {createOrderMode === 'guest' ? 'background: #166534; color: #fff;' : 'background: transparent; color: #475569;'}"
                                >
                                    🚶 ทั่วไป / Walk-in
                                </button>
                            </div>
                        </div>

                        {#if createOrderMode === 'member'}
                            {#if selectedMemberForOrder}
                                <!-- การ์ดแสดงสมาชิกที่เลือกแล้ว -->
                                <div style="background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 12px; padding: 0.85rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
                                    <div>
                                        <div style="font-size: 0.95rem; font-weight: 800; color: #14532d; display: flex; align-items: center; gap: 0.4rem;">
                                            <span>✅ {selectedMemberForOrder.fullName || `${selectedMemberForOrder.firstName || ''} ${selectedMemberForOrder.lastName || ''}`.trim() || 'สมาชิก'}</span>
                                            <span style="font-size: 0.75rem; background: #dcfce7; color: #15803d; border: 1px solid #86efac; padding: 0.1rem 0.5rem; border-radius: 999px;">
                                                {selectedMemberForOrder.phone}
                                            </span>
                                        </div>
                                        <div style="font-size: 0.78rem; color: #166534; margin-top: 0.25rem;">
                                            ⭐ แต้มสะสมปัจจุบัน: <strong>{selectedMemberForOrder.points || 0}</strong> แต้ม (สั่งสะสมแล้ว {selectedMemberForOrder.totalStampsEarned || 0} แก้ว)
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onclick={clearSelectedMemberForOrder}
                                        style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 0.35rem 0.7rem; font-size: 0.76rem; font-weight: 700; color: #475569; cursor: pointer;"
                                    >
                                        🔄 เปลี่ยนสมาชิก
                                    </button>
                                </div>
                            {:else}
                                <!-- ช่องค้นหาสมาชิก -->
                                <div>
                                    <input
                                        type="text"
                                        class="form-input"
                                        placeholder="🔍 ค้นหาสมาชิกด้วยชื่อ หรือเบอร์โทรศัพท์..."
                                        bind:value={createOrderMemberSearch}
                                        style="font-size: 0.85rem; padding: 0.5rem 0.75rem; width: 100%; margin-bottom: 0.5rem;"
                                    />
                                    <div style="max-height: 150px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.35rem; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 0.4rem;">
                                        {#if filteredMembersForOrder.length === 0}
                                            <div style="font-size: 0.8rem; color: #94a3b8; text-align: center; padding: 0.6rem;">
                                                ไม่พบสมาชิกที่ตรงกับคำค้นหา
                                            </div>
                                        {:else}
                                            {#each filteredMembersForOrder as m}
                                                <div
                                                    style="display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0.6rem; border-radius: 8px; background: #f8fafc; border: 1px solid #f1f5f9; cursor: pointer; transition: background 0.15s;"
                                                    onclick={() => selectMemberForNewOrder(m)}
                                                >
                                                    <div>
                                                        <span style="font-weight: 700; font-size: 0.85rem; color: #1e293b;">
                                                            {m.fullName || `${m.firstName || ''} ${m.lastName || ''}`.trim() || 'สมาชิก'}
                                                        </span>
                                                        <span style="font-size: 0.75rem; color: #64748b; margin-left: 0.4rem;">
                                                            📞 {m.phone}
                                                        </span>
                                                    </div>
                                                    <div style="display: flex; align-items: center; gap: 0.4rem;">
                                                        <span style="font-size: 0.72rem; background: #dcfce7; color: #14532d; padding: 0.15rem 0.45rem; border-radius: 999px; font-weight: 700;">
                                                            ⭐ {m.points || 0} แต้ม
                                                        </span>
                                                        <button
                                                            type="button"
                                                            style="background: #166534; color: #ffffff; border: none; border-radius: 6px; padding: 0.2rem 0.55rem; font-size: 0.74rem; font-weight: 700; cursor: pointer;"
                                                        >
                                                            เลือก
                                                        </button>
                                                    </div>
                                                </div>
                                            {/each}
                                        {/if}
                                    </div>
                                </div>
                            {/if}
                        {/if}

                        <!-- ช่องชื่อและเบอร์โทร (แก้ไขได้เสมอ) -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; margin-top: 0.75rem;">
                            <div>
                                <label class="form-label" style="font-size: 0.78rem;" for="createOrderName">ชื่อผู้รับ / ชื่อลูกค้า *:</label>
                                <input
                                    id="createOrderName"
                                    type="text"
                                    class="form-input"
                                    placeholder="เช่น คุณหมอเอ, สมาชิก"
                                    bind:value={newOrderName}
                                    style="font-size: 0.85rem;"
                                />
                            </div>
                            <div>
                                <label class="form-label" style="font-size: 0.78rem;" for="createOrderPhone">เบอร์โทรศัพท์ (สำหรับสะสมแต้ม):</label>
                                <input
                                    id="createOrderPhone"
                                    type="tel"
                                    class="form-input"
                                    placeholder="เช่น 0812345678"
                                    bind:value={newOrderPhone}
                                    style="font-size: 0.85rem;"
                                />
                            </div>
                        </div>
                    </div>

                    <!-- 2. หมวดเลือกแก้วเครื่องดื่ม -->
                    <div style="background: #f0fdf4; border: 1.5px solid #bbf7d0; border-radius: 16px; padding: 1rem;">
                        <span style="font-weight: 800; font-size: 0.92rem; color: #14532d; display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.75rem;">
                            🍵 2. เลือกเครื่องดื่มลงคิว
                        </span>

                        <div style="display: flex; flex-direction: column; gap: 0.75rem; background: #ffffff; border: 1px solid #dcfce7; border-radius: 12px; padding: 0.85rem;">
                            <!-- เมนูเครื่องดื่ม & ราคา -->
                            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 0.6rem;">
                                <div>
                                    <label class="form-label" style="font-size: 0.78rem;" for="drinkMenuSelect">เลือกเมนูเครื่องดื่ม:</label>
                                    <select id="drinkMenuSelect" class="form-input" bind:value={currentDrinkMenuId} onchange={() => (currentDrinkAddonId = '')} style="font-size: 0.85rem;">
                                        {#each menuItems as item}
                                            <option value={item.id}>
                                                {item.thaiName} ({item.price}฿) {item.isFermented ? '⏳ เมนูบ่ม' : ''} {!item.isAvailable ? '⛔ (ปิดจำหน่าย)' : ''}
                                            </option>
                                        {/each}
                                    </select>
                                </div>
                                <div>
                                    <label class="form-label" style="font-size: 0.78rem;" for="drinkCustomPrice">ราคา/แก้ว (บาท):</label>
                                    <input
                                        id="drinkCustomPrice"
                                        type="number"
                                        min="0"
                                        class="form-input"
                                        placeholder={String(
                                            Number(menuItems.find((m) => m.id === currentDrinkMenuId)?.price || 55) +
                                            Number(menuItems.find((m) => m.id === currentDrinkMenuId)?.addons?.find((a: any) => a.id === currentDrinkAddonId)?.price || 0)
                                        )}
                                        bind:value={currentDrinkCustomPrice}
                                        style="font-size: 0.85rem;"
                                    />
                                </div>
                            </div>

                            <!-- ตัวเลือกเสริม / เพิ่มช็อต (ถ้ามี) -->
                            {#if (menuItems.find((m) => m.id === currentDrinkMenuId)?.addons || []).length > 0}
                                {@const currentItemAddons = menuItems.find((m) => m.id === currentDrinkMenuId)?.addons || []}
                                <div style="background: #f0fdf4; border: 1px dashed #86efac; border-radius: 10px; padding: 0.5rem 0.65rem;">
                                    <label class="form-label" style="font-size: 0.78rem; margin-bottom: 0.35rem; display: block; color: #166534;" for="addonPicker">
                                        🍵 ตัวเลือกเพิ่มช็อต / เสริม:
                                    </label>
                                    <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;" id="addonPicker">
                                        <button
                                            type="button"
                                            onclick={() => (currentDrinkAddonId = '')}
                                            style="padding: 0.3rem 0.6rem; font-size: 0.75rem; font-weight: {currentDrinkAddonId === '' ? '800' : '600'}; border-radius: 8px; border: 1px solid {currentDrinkAddonId === '' ? '#166534' : '#cbd5e1'}; background: {currentDrinkAddonId === '' ? '#dcfce7' : '#ffffff'}; color: {currentDrinkAddonId === '' ? '#14532d' : '#475569'}; cursor: pointer;"
                                        >
                                            {currentDrinkAddonId === '' ? '●' : '○'} ไม่เพิ่ม (+0฿)
                                        </button>
                                        {#each currentItemAddons as addon}
                                            {@const isSelected = currentDrinkAddonId === addon.id}
                                            <button
                                                type="button"
                                                onclick={() => (currentDrinkAddonId = isSelected ? '' : addon.id)}
                                                style="padding: 0.3rem 0.6rem; font-size: 0.75rem; font-weight: {isSelected ? '800' : '600'}; border-radius: 8px; border: 1px solid {isSelected ? '#166534' : '#86efac'}; background: {isSelected ? '#166534' : '#ffffff'}; color: {isSelected ? '#ffffff' : '#166534'}; cursor: pointer; display: flex; align-items: center; gap: 0.3rem;"
                                            >
                                                <span>{isSelected ? '●' : '○'} {addon.name}</span>
                                                <span style="font-size: 0.7rem; font-weight: 800;">(+{addon.price}฿)</span>
                                            </button>
                                        {/each}
                                    </div>
                                </div>
                            {/if}

                            <!-- ความหวาน & จำนวน -->
                            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 0.6rem; align-items: center;">
                                <div>
                                    <label class="form-label" style="font-size: 0.78rem; margin-bottom: 0.35rem; display: block;" for="sweetnessPicker">ระดับความหวาน:</label>
                                    <div style="display: flex; gap: 0.3rem;" id="sweetnessPicker">
                                        {#each [0, 25, 50, 75, 100] as sweet}
                                            <button
                                                type="button"
                                                onclick={() => (currentDrinkSweetness = sweet)}
                                                style="flex: 1; padding: 0.35rem 0.2rem; font-size: 0.75rem; font-weight: 800; border-radius: 8px; border: 1px solid #86efac; cursor: pointer; transition: all 0.15s; {currentDrinkSweetness === sweet ? 'background: #166534; color: #fff; border-color: #166534;' : 'background: #f0fdf4; color: #166534;'}"
                                            >
                                                {sweet}%
                                            </button>
                                        {/each}
                                    </div>
                                </div>
                                <div>
                                    <label class="form-label" style="font-size: 0.78rem; margin-bottom: 0.35rem; display: block;" for="drinkQtyInput">จำนวนแก้ว:</label>
                                    <div style="display: flex; align-items: center; gap: 0.35rem;">
                                        <button
                                            type="button"
                                            onclick={() => (currentDrinkQuantity = Math.max(1, currentDrinkQuantity - 1))}
                                            style="width: 32px; height: 32px; border: 1px solid #cbd5e1; border-radius: 8px; background: #f8fafc; font-weight: 800; font-size: 1rem; cursor: pointer;"
                                        >-</button>
                                        <input
                                            id="drinkQtyInput"
                                            type="number"
                                            min="1"
                                            bind:value={currentDrinkQuantity}
                                            style="width: 48px; text-align: center; font-weight: 800; font-size: 0.9rem; padding: 0.3rem; border: 1px solid #cbd5e1; border-radius: 8px;"
                                        />
                                        <button
                                            type="button"
                                            onclick={() => (currentDrinkQuantity = currentDrinkQuantity + 1)}
                                            style="width: 32px; height: 32px; border: 1px solid #cbd5e1; border-radius: 8px; background: #f8fafc; font-weight: 800; font-size: 1rem; cursor: pointer;"
                                        >+</button>
                                    </div>
                                </div>
                            </div>

                            <!-- โน้ต & แท็กด่วน -->
                            <div>
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.3rem;">
                                    <label class="form-label" style="font-size: 0.78rem; margin: 0;" for="drinkNoteInput">โน้ตพิเศษแก้วนี้:</label>
                                    <div style="display: flex; gap: 0.3rem; flex-wrap: wrap;">
                                        {#each ['แยกน้ำแข็ง', 'ชงร้อน', 'ไม่ใส่นมข้น', 'แก้วส่วนตัว'] as tag}
                                            <button
                                                type="button"
                                                onclick={() => { currentDrinkNote = currentDrinkNote ? `${currentDrinkNote}, ${tag}` : tag; }}
                                                style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 999px; padding: 0.15rem 0.5rem; font-size: 0.7rem; color: #475569; cursor: pointer;"
                                            >
                                                +{tag}
                                            </button>
                                        {/each}
                                    </div>
                                </div>
                                <input
                                    id="drinkNoteInput"
                                    type="text"
                                    class="form-input"
                                    placeholder="เช่น แยกน้ำแข็ง, นำแก้วมาเอง"
                                    bind:value={currentDrinkNote}
                                    style="font-size: 0.82rem;"
                                />
                            </div>

                            <!-- ปุ่มเพิ่มแก้วลงรายการ -->
                            <button
                                type="button"
                                onclick={addDrinkToNewOrder}
                                style="background: #166534; color: #ffffff; border: none; border-radius: 10px; padding: 0.6rem; font-size: 0.88rem; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.4rem; box-shadow: 0 3px 10px rgba(22, 101, 52, 0.2);"
                            >
                                ➕ เพิ่มแก้วนี้ลงรายการ (Add to Order)
                            </button>
                        </div>

                        <!-- ตารางรายการเครื่องดื่มที่เพิ่มแล้วในออเดอร์ -->
                        <div style="margin-top: 0.85rem;">
                            <div style="font-size: 0.82rem; font-weight: 800; color: #14532d; margin-bottom: 0.4rem;">
                                📋 รายการแก้วในออเดอร์นี้ ({newOrderBasket.reduce((sum, item) => sum + item.quantity, 0)} แก้ว):
                            </div>
                            {#if newOrderBasket.length === 0}
                                <div style="background: #ffffff; border: 1.5px dashed #86efac; border-radius: 12px; padding: 1.25rem; text-align: center; color: #64748b; font-size: 0.85rem;">
                                    ยังไม่มีเครื่องดื่มในรายการ กรุณาเลือกเมนูแล้วกดปุ่ม "เพิ่มแก้วนี้ลงรายการ" ด้านบนค่ะ
                                </div>
                            {:else}
                                <div style="display: flex; flex-direction: column; gap: 0.45rem;">
                                    {#each newOrderBasket as item, idx}
                                        <div style="display: flex; justify-content: space-between; align-items: center; background: #ffffff; border: 1px solid #bbf7d0; border-radius: 10px; padding: 0.5rem 0.75rem;">
                                            <div>
                                                <div style="font-weight: 800; font-size: 0.88rem; color: #1e293b;">
                                                    {item.thaiName} <span style="font-weight: 600; font-size: 0.76rem; color: #166534;">(หวาน {item.sweetness}%)</span>
                                                </div>
                                                {#if item.addonName}
                                                    <div style="font-size: 0.75rem; color: #166534; font-weight: 700; margin-top: 0.15rem;">
                                                        🍵 + {item.addonName} (+{item.addonPrice || 0} ฿)
                                                    </div>
                                                {/if}
                                                {#if item.note}
                                                    <div style="font-size: 0.75rem; color: #d97706;">
                                                        📝 {item.note}
                                                    </div>
                                                {/if}
                                                <div style="font-size: 0.76rem; color: #64748b;">
                                                    {item.price} บาท × {item.quantity} = <strong>{item.price * item.quantity}</strong> บาท
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onclick={() => removeDrinkFromNewOrder(idx)}
                                                style="background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; border-radius: 8px; padding: 0.3rem 0.55rem; font-size: 0.78rem; font-weight: 800; cursor: pointer;"
                                                title="ลบแก้วนี้"
                                            >
                                                🗑️ ลบ
                                            </button>
                                        </div>
                                    {/each}
                                </div>

                                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.6rem; padding: 0.5rem 0.75rem; background: #ffffff; border-radius: 10px; border: 1px solid #86efac;">
                                    <span style="font-weight: 800; font-size: 0.88rem; color: #14532d;">ยอดรวมคำนวณ:</span>
                                    <span style="font-weight: 900; font-size: 1.1rem; color: #15803d;">{newOrderCalculatedTotal} บาท</span>
                                </div>
                            {/if}
                        </div>
                    </div>

                    <!-- 3. วันที่และสถานที่จัดส่ง -->
                    <div style="background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 16px; padding: 1rem;">
                        <span style="font-weight: 800; font-size: 0.92rem; color: #1e293b; display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.75rem;">
                            🚚 3. วันที่และสถานที่จัดส่ง
                        </span>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; margin-bottom: 0.75rem;">
                            <div>
                                <label class="form-label" style="font-size: 0.78rem;" for="orderDeliveryDate">วันที่จัดส่ง:</label>
                                <input
                                    id="orderDeliveryDate"
                                    type="date"
                                    class="form-input"
                                    bind:value={newOrderDeliveryDate}
                                    style="font-size: 0.85rem;"
                                />
                            </div>
                            <div>
                                <label class="form-label" style="font-size: 0.78rem;" for="orderDeliveryRound">รอบจัดส่ง:</label>
                                <select
                                    id="orderDeliveryRound"
                                    class="form-input"
                                    bind:value={newOrderDeliveryRound}
                                    onchange={(e) => {
                                        const val = (e.target as HTMLSelectElement).value;
                                        if (val.includes('เช้า')) newOrderDeliveryRoundId = 'morning';
                                        else if (val.includes('เที่ยง')) newOrderDeliveryRoundId = 'noon';
                                        else newOrderDeliveryRoundId = 'walkin';
                                    }}
                                    style="font-size: 0.85rem;"
                                >
                                    <option value="รับหน้าร้าน / เสิร์ฟทันที">☕ รับหน้าร้าน / เสิร์ฟทันที</option>
                                    <option value="รอบเช้า (07:00–08:00 น.)">🌅 รอบเช้า (07:00–08:00 น.)</option>
                                    <option value="รอบเที่ยง (12:30–13:00 น.)">☀️ รอบเที่ยง (12:30–13:00 น.)</option>
                                    {#each settings.deliveryRounds as round}
                                        <option value="{round.name} ({round.timeSlot})">
                                            📦 {round.name} ({round.timeSlot})
                                        </option>
                                    {/each}
                                </select>
                            </div>
                        </div>

                        <!-- สถานที่จัดส่งและปุ่มด่วน -->
                        <div>
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem; flex-wrap: wrap; gap: 0.3rem;">
                                <label class="form-label" style="font-size: 0.78rem; margin: 0;" for="orderAddressInput">สถานที่จัดส่ง / แผนกใน รพ.:</label>
                                <div style="display: flex; gap: 0.25rem; flex-wrap: wrap;">
                                    {#each ['หน้าร้าน (รับเอง)', 'OPD', 'IPD 2', 'IPD 3', 'ห้องฉุกเฉิน ER', 'ตึกอำนวยการ', 'ห้องแล็บ', 'ห้องยา', 'แฟลตเจ้าหน้าที่'] as loc}
                                        <button
                                            type="button"
                                            onclick={() => (newOrderAddress = loc)}
                                            style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 999px; padding: 0.15rem 0.45rem; font-size: 0.7rem; color: #475569; cursor: pointer;"
                                        >
                                            {loc}
                                        </button>
                                    {/each}
                                </div>
                            </div>
                            <input
                                id="orderAddressInput"
                                type="text"
                                class="form-input"
                                placeholder="ระบุสถานที่ส่ง เช่น แผนกผู้ป่วยนอก (OPD)"
                                bind:value={newOrderAddress}
                                style="font-size: 0.85rem;"
                            />
                        </div>
                    </div>

                    <!-- 4. สถานะและวิธีชำระเงิน -->
                    <div style="background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 16px; padding: 1rem;">
                        <span style="font-weight: 800; font-size: 0.92rem; color: #1e293b; display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.75rem;">
                            💳 4. สถานะออเดอร์และการชำระเงิน
                        </span>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem;">
                            <div>
                                <label class="form-label" style="font-size: 0.78rem;" for="orderInitialStatus">สถานะเริ่มต้น:</label>
                                <select id="orderInitialStatus" class="form-input" bind:value={newOrderStatus} style="font-size: 0.85rem; font-weight: 700;">
                                    <option value="paid">🟢 พร้อมชง / รับยอดแล้ว (paid)</option>
                                    <option value="brewing">🍵 กำลังชง (brewing)</option>
                                    <option value="ready_to_ship">✨ ชงเสร็จแล้ว (ready_to_ship)</option>
                                    <option value="completed">✅ จัดส่งสำเร็จ / รับเครื่องดื่มแล้ว (completed)</option>
                                    <option value="pending">🟡 รอตรวจสลิป / รอชำระ (pending)</option>
                                </select>
                            </div>
                            <div>
                                <label class="form-label" style="font-size: 0.78rem;" for="orderPayNote">บันทึกการชำระเงิน:</label>
                                <select id="orderPayNote" class="form-input" bind:value={newOrderPaymentNote} style="font-size: 0.85rem;">
                                    <option value="ชำระแล้ว (เงินสด/แอดมินรับยอด)">💵 ชำระแล้ว (เงินสด/แอดมินรับยอด)</option>
                                    <option value="ชำระแล้ว (โอนเงิน/PromptPay)">📱 ชำระแล้ว (โอนเงิน/PromptPay)</option>
                                    <option value="สิทธิ์พิเศษ / เลี้ยงรับรอง">🎁 สิทธิ์พิเศษ / เลี้ยงรับรอง</option>
                                    <option value="ยังไม่ชำระ (เก็บเงินปลายทาง)">⏳ ยังไม่ชำระ (เก็บเงินปลายทาง)</option>
                                </select>
                            </div>
                        </div>

                        <div style="margin-top: 0.6rem;">
                            <label class="form-label" style="font-size: 0.78rem;" for="orderSellerMsg">หมายเหตุเพิ่มเติมถึงผู้ชง/จัดส่ง (ถ้ามี):</label>
                            <input
                                id="orderSellerMsg"
                                type="text"
                                class="form-input"
                                placeholder="เช่น ฝากวางไว้ที่โต๊ะพยาบาล"
                                bind:value={newOrderSellerMessage}
                                style="font-size: 0.82rem;"
                            />
                        </div>
                    </div>
                </div>

                <!-- Modal Footer Actions -->
                <div style="display: flex; gap: 0.65rem; margin-top: 1.4rem; padding-top: 1rem; border-top: 1px solid #e2e8f0;">
                    <button
                        type="button"
                        onclick={handleConfirmCreateOrder}
                        disabled={isSubmittingCreateOrder || newOrderBasket.length === 0}
                        style="flex: 2; padding: 0.8rem; background: #166534; color: #ffffff; border: none; border-radius: 12px; font-weight: 800; font-size: 0.95rem; cursor: {isSubmittingCreateOrder || newOrderBasket.length === 0 ? 'not-allowed' : 'pointer'}; opacity: {isSubmittingCreateOrder || newOrderBasket.length === 0 ? '0.6' : '1'}; display: flex; align-items: center; justify-content: center; gap: 0.4rem; box-shadow: 0 4px 14px rgba(22, 101, 52, 0.3);"
                    >
                        {isSubmittingCreateOrder ? '⏳ กำลังบันทึก...' : `✅ ยืนยันเพิ่มออเดอร์เข้าคิว (${effectiveNewOrderTotal} บาท)`}
                    </button>
                    <button
                        type="button"
                        onclick={() => (showCreateOrderModal = false)}
                        class="btn-matcha-outline"
                        style="flex: 1; padding: 0.8rem; border-radius: 12px; font-weight: 700;"
                    >
                        ยกเลิก
                    </button>
                </div>
            </div>
        </div>
    {/if}
</main>
{/if}

<style>
    .admin-header-bar {
        width: 100%;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 1rem;
        margin-bottom: 1.35rem;
    }

    .admin-page-title {
        margin: 0;
        font-size: clamp(1.35rem, 4vw, 1.85rem);
        color: var(--matcha-deep);
        line-height: 1.25;
    }

    .admin-page-subtitle {
        margin: 0.15rem 0 0 0;
        font-size: 0.82rem;
        color: var(--text-muted);
    }

    .admin-header-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
    }

    .admin-main-tabs {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 0.45rem;
        background: #f1f6ee;
        padding: 0.4rem;
        border-radius: 16px;
        border: 1px solid #d5e6cc;
        margin-bottom: 1.5rem;
        width: 100%;
    }

    .admin-main-tab-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.35rem;
        padding: 0.7rem 0.5rem;
        font-size: 0.9rem;
        font-weight: 700;
        border: none;
        border-radius: 12px;
        background: transparent;
        color: #52684b;
        cursor: pointer;
        transition: all 0.18s ease;
        white-space: nowrap;
    }

    .admin-main-tab-btn.active {
        background: #ffffff;
        color: var(--matcha-deep);
        box-shadow: 0 4px 12px rgba(27, 45, 22, 0.1);
    }

    .admin-stats-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 0.9rem;
        width: 100%;
        margin-bottom: 1.5rem;
    }

    .admin-stat-card {
        padding: 1.15rem !important;
        max-width: none !important;
    }

    .admin-stat-value {
        margin: 0.25rem 0 0 0;
        font-family: 'Outfit', sans-serif;
        font-size: clamp(1.35rem, 3.5vw, 1.8rem);
    }

    /* ตารางสมาชิก Desktop vs การ์ดสมาชิก Mobile */
    .admin-members-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.85rem;
        margin-bottom: 1rem;
    }

    .admin-members-search-box {
        display: flex;
        gap: 0.5rem;
        flex: 1;
        max-width: 380px;
    }

    .admin-members-mobile-list {
        display: none;
        flex-direction: column;
        gap: 0.85rem;
    }

    .admin-member-mobile-card {
        border: 1.5px solid #e2e8f0;
        border-radius: 16px;
        padding: 1rem;
        background: #ffffff;
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
    }

    .member-mcard-top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 0.5rem;
    }

    .member-mcard-stats {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
    }

    .mcard-stat-pill {
        background: #f3f8ef;
        border: 1px solid #d5e6cc;
        color: #2b4c21;
        font-size: 0.78rem;
        padding: 0.25rem 0.65rem;
        border-radius: 999px;
    }

    .member-mcard-actions {
        display: flex;
        gap: 0.45rem;
        flex-wrap: wrap;
        padding-top: 0.35rem;
        border-top: 1px dashed #e2e8f0;
    }

    @media (max-width: 768px) {
        .admin-page-shell {
            padding-left: 0.75rem !important;
            padding-right: 0.75rem !important;
        }

        .admin-header-bar {
            flex-direction: column;
            align-items: stretch;
            gap: 0.75rem;
        }

        .admin-header-actions {
            width: 100%;
            display: grid;
            grid-template-columns: 1fr 1fr;
        }

        .admin-header-actions button {
            width: 100%;
            justify-content: center;
        }

        .admin-main-tabs {
            grid-template-columns: repeat(2, 1fr);
            gap: 0.35rem;
            padding: 0.35rem;
        }

        .admin-main-tab-btn {
            font-size: 0.8rem;
            padding: 0.6rem 0.35rem;
        }

        .admin-stats-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 0.65rem;
        }

        .admin-stat-card {
            padding: 0.85rem !important;
        }

        .admin-section-card {
            padding: 1rem !important;
        }

        .admin-members-search-box {
            max-width: 100%;
            width: 100%;
        }

        .admin-members-desktop-table {
            display: none;
        }

        .admin-members-mobile-list {
            display: flex;
        }
    }
</style>

