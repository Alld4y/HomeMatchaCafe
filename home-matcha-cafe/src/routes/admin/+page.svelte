<script lang="ts">
    import { onMount } from 'svelte';
    import swal from 'sweetalert2';

    interface AdminOrder {
        id: string;
        order_id: string;
        name: string;
        memberName?: string;
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
        notifications: {
            enabled: boolean;
            notifyOnSlipApproved: boolean;
            notifyOnDelivering: boolean;
            notifyOnCompleted: boolean;
            enableWebPush: boolean;
            enableLineOA: boolean;
            lineOaChannelAccessToken?: string;
            lineOaChannelSecret?: string;
        };
        lineOa: LineOaSettingsData;
    }

    interface LineOaKeywordReply {
        id: string;
        keyword: string;
        matchType: 'exact' | 'contains';
        replyType: 'text' | 'flex_menu' | 'flex_status' | 'flex_loyalty';
        replyText?: string;
        enabled: boolean;
    }

    interface LineOaSettingsData {
        enabled: boolean;
        channelSecret: string;
        channelAccessToken: string;
        botBasicId: string;
        adminLineUserId: string;
        adminPhone: string;
        autoReplyEnabled: boolean;
        welcomeMessage: string;
        useCustomWelcomeCard?: boolean;
        welcomeCardBubble?: any;
        welcomeCardBlocks?: any[] | null;

        // Event ได้เบอร์: กรณีพบเบอร์ในระบบ (เป็นสมาชิกแล้ว)
        phoneLinkedExistingReplyType?: 'card' | 'text' | 'both';
        phoneLinkedExistingMessage?: string;
        useCustomMemberCard?: boolean;
        memberCardBubble?: any;
        memberCardBlocks?: any[] | null;

        // Event ได้เบอร์: กรณียังไม่พบเบอร์ในระบบ (ยังไม่เป็นสมาชิก)
        phoneLinkedNewReplyType?: 'card' | 'text' | 'both';
        phoneLinkedNewMessage?: string;
        useCustomRegisterCard?: boolean;
        registerCardBubble?: any;
        registerCardBlocks?: any[] | null;

        defaultReplyMessage: string;
        keywordReplies: LineOaKeywordReply[];
        notifyOnOrderCreated: boolean;
        notifyOnSlipApproved: boolean;
        notifyOnBrewing: boolean;
        notifyOnReadyToShip: boolean;
        notifyOnDelivering: boolean;
        notifyOnCompleted: boolean;
        notifyOnCancelled: boolean;
        notifyOnPhoneLinked: boolean;
        notifyOnMemberRegistered: boolean;
        customStatusCards?: Record<string, { enabled: boolean; bubble: any; blocks?: any[] | null }>;
        notifyAdminOnNewOrder: boolean;
        notifyAdminOnSlipUploaded: boolean;
    }

    // 🔐 ระบบล็อกรหัสผ่านหน้า Admin (ตรวจสอบกับ ADMIN_PASSWORD ใน .env)
    let isAdminAuthenticated = $state(false);
    let adminPasswordInput = $state('');
    let adminAuthError = $state('');
    let isVerifyingAdmin = $state(false);

    // แท็บหน้า Admin: 'orders' | 'delivery' | 'history' | 'line_oa' | 'settings' | 'members' | 'menus'
    let activeTab = $state<'orders' | 'delivery' | 'history' | 'line_oa' | 'settings' | 'members' | 'menus'>('orders');

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
        notifications: {
            enabled: true,
            notifyOnSlipApproved: true,
            notifyOnDelivering: true,
            notifyOnCompleted: true,
            enableWebPush: true,
            enableLineOA: true,
            lineOaChannelAccessToken: '',
            lineOaChannelSecret: 'ae1cf62ef3dbe63af73e93dd4b946bb1'
        },
        lineOa: {
            enabled: true,
            channelSecret: 'ae1cf62ef3dbe63af73e93dd4b946bb1',
            channelAccessToken: '',
            botBasicId: '@719wvlgi',
            adminLineUserId: 'Uc04ed4f079c031e33621c131cec0ca27',
            adminPhone: '',
            autoReplyEnabled: true,
            welcomeMessage: 'ยินดีต้อนรับสู่ Home Matcha Cafe 🍵✨\nคุณสามารถพิมพ์ "เมนู" เพื่อดูรายการเครื่องดื่ม, "สถานะ" เพื่อติดตามออเดอร์, "แต้ม" เพื่อเช็คคะแนนสะสม หรือพิมพ์เบอร์โทรศัพท์ 10 หลัก เพื่อเชื่อมต่อรับแจ้งเตือนได้เลยค่ะ',
            useCustomWelcomeCard: false,
            welcomeCardBubble: null,
            welcomeCardBlocks: null,

            // Event ได้เบอร์: กรณีมีสมาชิกอยู่แล้ว
            phoneLinkedExistingReplyType: 'card',
            phoneLinkedExistingMessage: 'ยินดีต้อนรับคุณ {name} ✨ คุณมีคะแนนสะสม {points} ดวง ระบบเชื่อมต่อ LINE กับบัญชีสมาชิกเรียบร้อยแล้วค่ะ! 🍵',
            useCustomMemberCard: false,
            memberCardBubble: null,
            memberCardBlocks: null,

            // Event ได้เบอร์: กรณียังไม่เป็นสมาชิก
            phoneLinkedNewReplyType: 'card',
            phoneLinkedNewMessage: 'บันทึกเบอร์โทรศัพท์ {phone} เรียบร้อยแล้วค่ะ! คุณยังไม่ได้เป็นสมาชิกสะสมแต้ม กดสมัครสมาชิกสะสมแต้มเพื่อรับสิทธิ์ 10 แก้วฟรี 1 แก้วได้เลยนะคะ 🍵\n👉 สมัครได้ที่: {registerUrl}',
            useCustomRegisterCard: false,
            registerCardBubble: null,
            registerCardBlocks: null,

            defaultReplyMessage: 'ขออภัยค่ะ หากต้องการดูรายการเครื่องดื่ม พิมพ์ "เมนู" หรือพิมพ์เบอร์โทรศัพท์ 10 หลัก เพื่อเชื่อมต่อระบบสมาชิกและรับแจ้งเตือนสถานะออเดอร์นะคะ 🍵',
            keywordReplies: [
                { id: 'kw-1', keyword: 'เมนู', matchType: 'exact', replyType: 'flex_menu', replyText: 'รายการเครื่องดื่ม Home Matcha Cafe', enabled: true },
                { id: 'kw-2', keyword: 'สั่งซื้อ', matchType: 'contains', replyType: 'flex_menu', replyText: 'สั่งซื้อเครื่องดื่มได้ที่ https://homematchacafe.store', enabled: true },
                { id: 'kw-3', keyword: 'สถานะ', matchType: 'contains', replyType: 'flex_status', replyText: 'ตรวจสอบสถานะออเดอร์ของคุณ', enabled: true },
                { id: 'kw-4', keyword: 'แต้ม', matchType: 'contains', replyType: 'flex_loyalty', replyText: 'ตรวจสอบคะแนนสะสมและแลกแก้วฟรี', enabled: true },
                { id: 'kw-5', keyword: 'เวลาส่ง', matchType: 'contains', replyType: 'text', replyText: '🍵 รอบจัดส่งของร้าน:\n- รอบเช้า: 07:00–08:00 น.\n- รอบเที่ยง: 12:30–13:00 น.\n(วันหยุด/เสาร์-อาทิตย์ รอบสาย–บ่าย: 09:00–13:00 น.)', enabled: true }
            ],
            notifyOnOrderCreated: true,
            notifyOnSlipApproved: true,
            notifyOnBrewing: true,
            notifyOnReadyToShip: true,
            notifyOnDelivering: true,
            notifyOnCompleted: true,
            notifyOnCancelled: true,
            notifyOnPhoneLinked: true,
            notifyOnMemberRegistered: true,
            customStatusCards: {},
            notifyAdminOnNewOrder: true,
            notifyAdminOnSlipUploaded: true
        },
        deliveryRounds: [
            { id: 'morning', name: 'รอบเช้า', timeSlot: '07:00–08:00 น.', cutoffTime: '06:00', allowFermented: true, isAllDayOpen: false, enabled: true },
            { id: 'noon', name: 'รอบเที่ยง', timeSlot: '12:30–13:00 น.', cutoffTime: '11:30', allowFermented: true, isAllDayOpen: false, enabled: true },
            { id: 'allday', name: 'รอบสาย–บ่าย', timeSlot: '09:00–13:00 น.', cutoffTime: '13:00', allowFermented: true, isAllDayOpen: true, enabled: true }
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

    // ✏️ State & Functions สำหรับ Modal แก้ไขคำสั่งซื้อ
    let isEditOrderModalOpen = $state(false);
    let editingOrder = $state<AdminOrder | null>(null);
    let editOrderStatus = $state<AdminOrder['status']>('paid');
    let editOrderName = $state('');
    let editOrderPhone = $state('');
    let editOrderAddress = $state('');
    let editOrderMessage = $state('');
    let editOrderDeliveryDate = $state('');
    let editOrderDeliveryRound = $state('');
    let editOrderDeliveryRoundId = $state('');
    let editOrderTotalPrice = $state<number>(0);
    let editOrderBasket = $state<any[]>([]);
    let isSavingOrderEdit = $state(false);
    let editOrderAddDrinkMenuId = $state('');

    function openEditOrderModal(order: AdminOrder) {
        editingOrder = order;
        editOrderStatus = order.status;
        editOrderName = order.name || '';
        editOrderPhone = order.phone || '';
        editOrderAddress = order.address || '';
        editOrderMessage = order.message || '';
        editOrderDeliveryDate = order.deliveryDate || '';
        editOrderDeliveryRound = order.deliveryRound || '';
        editOrderDeliveryRoundId = order.deliveryRoundId || '';
        editOrderTotalPrice = Number(order.totalPrice || 0);
        editOrderBasket = JSON.parse(JSON.stringify(order.basket || []));
        editOrderAddDrinkMenuId = menuItems.length > 0 ? menuItems[0].id : '';
        isEditOrderModalOpen = true;
    }

    function recalculateEditOrderTotal() {
        const sum = editOrderBasket.reduce((acc, it) => acc + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
        editOrderTotalPrice = sum;
    }

    function addDrinkToEditOrder() {
        if (!editOrderAddDrinkMenuId && menuItems.length > 0) {
            editOrderAddDrinkMenuId = menuItems[0].id;
        }
        const item = menuItems.find((m: any) => m.id === editOrderAddDrinkMenuId) || menuItems[0];
        if (!item) return;
        editOrderBasket = [
            ...editOrderBasket,
            {
                id: item.id,
                thaiName: item.thaiName || item.name,
                englishName: item.englishName || item.id,
                name: item.thaiName || item.name,
                price: Number(item.price || 55),
                basePrice: Number(item.price || 55),
                quantity: 1,
                sweetness: 50,
                note: ''
            }
        ];
        recalculateEditOrderTotal();
    }

    function removeDrinkFromEditOrder(idx: number) {
        editOrderBasket = editOrderBasket.filter((_, i) => i !== idx);
        recalculateEditOrderTotal();
    }

    async function saveOrderEdit() {
        if (!editingOrder) return;
        if (!editOrderName.trim()) {
            swal.fire({ icon: 'warning', title: 'กรุณาระบุชื่อผู้สั่ง', confirmButtonColor: '#166534' });
            return;
        }
        if (!editOrderPhone.trim()) {
            swal.fire({ icon: 'warning', title: 'กรุณาระบุเบอร์โทรศัพท์', confirmButtonColor: '#166534' });
            return;
        }
        if (editOrderBasket.length === 0) {
            swal.fire({ icon: 'warning', title: 'ต้องมีรายการเครื่องดื่มอย่างน้อย 1 แก้ว', confirmButtonColor: '#166534' });
            return;
        }

        isSavingOrderEdit = true;
        try {
            const res = await fetch(`/api/orders/${editingOrder.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: editOrderStatus,
                    name: editOrderName.trim(),
                    phone: editOrderPhone.trim(),
                    address: editOrderAddress.trim(),
                    message: editOrderMessage.trim(),
                    deliveryDate: editOrderDeliveryDate || null,
                    deliveryRound: editOrderDeliveryRound || null,
                    deliveryRoundId: editOrderDeliveryRoundId || null,
                    totalPrice: Number(editOrderTotalPrice || 0),
                    basket: editOrderBasket
                })
            });

            if (res.ok) {
                const result = await res.json();
                const idx = orders.findIndex((o) => o.id === editingOrder?.id || o.order_id === editingOrder?.order_id);
                if (idx > -1 && result.order) {
                    orders[idx] = result.order;
                }
                await loadMembers();
                window.dispatchEvent(new CustomEvent('orders-updated'));
                isEditOrderModalOpen = false;
                editingOrder = null;

                swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'success',
                    title: 'บันทึกการแก้ไขคำสั่งซื้อเรียบร้อยแล้ว',
                    timer: 2000,
                    showConfirmButton: false
                });
            } else {
                const errData = await res.json();
                swal.fire('เกิดข้อผิดพลาด', errData.message || 'ไม่สามารถแก้ไขได้', 'error');
            }
        } catch (e: any) {
            console.error(e);
            swal.fire('ขัดข้อง', 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', 'error');
        } finally {
            isSavingOrderEdit = false;
        }
    }

    // ==============================================
    // 🔍 Modal ตรวจสอบคำขออนุมัติสลิปโอนเงิน (Manual Slip Review Modal)
    // ==============================================
    let isSlipReviewModalOpen = $state(false);
    let reviewCurrentOrder = $state<AdminOrder | null>(null);
    let isProcessingSlipReview = $state(false);

    function openSlipReviewModal(order: AdminOrder) {
        reviewCurrentOrder = order;
        isSlipReviewModalOpen = true;
    }

    function closeSlipReviewModal() {
        isSlipReviewModalOpen = false;
        reviewCurrentOrder = null;
    }

    function navigateSlipReview(direction: 'prev' | 'next') {
        if (!reviewCurrentOrder || manualReviewOrders.length === 0) return;
        const currentIdx = manualReviewOrders.findIndex(
            (o) => o.id === reviewCurrentOrder?.id || o.order_id === reviewCurrentOrder?.order_id
        );
        if (currentIdx === -1) {
            reviewCurrentOrder = manualReviewOrders[0];
            return;
        }
        if (direction === 'prev') {
            const prevIdx = (currentIdx - 1 + manualReviewOrders.length) % manualReviewOrders.length;
            reviewCurrentOrder = manualReviewOrders[prevIdx];
        } else {
            const nextIdx = (currentIdx + 1) % manualReviewOrders.length;
            reviewCurrentOrder = manualReviewOrders[nextIdx];
        }
    }

    async function handleApproveSlipFromModal() {
        if (!reviewCurrentOrder || isProcessingSlipReview) return;
        isProcessingSlipReview = true;
        const targetId = reviewCurrentOrder.id;
        const currentIdx = manualReviewOrders.findIndex(
            (o) => o.id === targetId || o.order_id === targetId
        );

        await updateStatus(targetId, 'paid');
        isProcessingSlipReview = false;

        const remaining = manualReviewOrders.filter(
            (o) => o.id !== targetId && o.order_id !== targetId
        );
        if (remaining.length > 0) {
            const nextIdx = currentIdx < remaining.length ? currentIdx : 0;
            reviewCurrentOrder = remaining[nextIdx];
        } else {
            isSlipReviewModalOpen = false;
            reviewCurrentOrder = null;
        }
    }

    async function handleRejectSlipFromModal() {
        if (!reviewCurrentOrder || isProcessingSlipReview) return;
        const targetId = reviewCurrentOrder.id;
        const targetCode = reviewCurrentOrder.order_id || targetId;

        const result = await swal.fire({
            title: 'ปฏิเสธสลิปนี้?',
            text: `ต้องการปฏิเสธสลิปของออเดอร์ ${targetCode} และยกเลิกคำสั่งซื้อใช่หรือไม่?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#94a3b8',
            confirmButtonText: 'ใช่, ปฏิเสธสลิป',
            cancelButtonText: 'ยกเลิก'
        });

        if (result.isConfirmed) {
            isProcessingSlipReview = true;
            const currentIdx = manualReviewOrders.findIndex(
                (o) => o.id === targetId || o.order_id === targetId
            );

            await updateStatus(targetId, 'cancelled');
            isProcessingSlipReview = false;

            const remaining = manualReviewOrders.filter(
                (o) => o.id !== targetId && o.order_id !== targetId
            );
            if (remaining.length > 0) {
                const nextIdx = currentIdx < remaining.length ? currentIdx : 0;
                reviewCurrentOrder = remaining[nextIdx];
            } else {
                isSlipReviewModalOpen = false;
                reviewCurrentOrder = null;
            }
        }
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

    // คำนวณวันที่ของวันนี้ในรูปแบบ YYYY-MM-DD (UTC+7)
    let todayDateStr = $derived.by(() => {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    });

    // เรียงลำดับคำสั่งซื้อตามเวลาที่สั่ง (FIFO: สั่งก่อนอยู่บนสุด ตามบรีฟแม่ค้า)
    let sortedOrders = $derived(
        [...orders].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    );

    // 🍵 คิวงานปัจจุบัน ณ ตอนนั้น (Live Working Queue):
    // - ตัดออเดอร์ที่ยกเลิก (cancelled) ออก 100% ไม่นำมาแสดงในคิวสดเลย
    // - แสดงเฉพาะออเดอร์ที่ยังต้องทำจริง (pending, paid, brewing, ready_to_ship, delivering)
    // - และออเดอร์ที่ส่งเสร็จแล้วเฉพาะของ "วันนี้" (completed of today)
    let liveOrders = $derived.by(() => {
        return sortedOrders.filter((o) => {
            if (o.status === 'cancelled') return false;
            if (o.status !== 'completed') return true;
            const orderDate = o.deliveryDate || o.createdAt.slice(0, 10);
            return orderDate === todayDateStr;
        });
    });

    // คำนวณสรุปยอดของคิวงานสด
    let liveTotalSales = $derived(
        liveOrders
            .filter((o) => o.status !== 'cancelled' && o.status !== 'pending')
            .reduce((sum, o) => sum + (o.totalPrice || 0), 0)
    );
    let totalSales = $derived(
        orders
            .filter((o) => o.status !== 'cancelled' && o.status !== 'pending')
            .reduce((sum, o) => sum + (o.totalPrice || 0), 0)
    );
    let manualReviewOrders = $derived(liveOrders.filter((o) => o.status === 'pending'));
    let toBrewCount = $derived(liveOrders.filter((o) => o.status === 'paid' || o.status === 'brewing').length);
    let brewingCount = $derived(toBrewCount);
    let readyToShipCount = $derived(liveOrders.filter((o) => o.status === 'ready_to_ship').length);
    let todayCompletedCount = $derived(liveOrders.filter((o) => o.status === 'completed').length);
    let completedCount = $derived(orders.filter((o) => o.status === 'completed').length);

    // ฟังก์ชันช่วยแยกเวลาเป็นนาทีสำหรับจัดเรียงก่อน-หลัง
    function extractMinutesFromString(str: string): number {
        if (!str) return 9999;
        const match = str.match(/(\d{1,2})[:.](\d{2})/);
        return match ? parseInt(match[1], 10) * 60 + parseInt(match[2], 10) : 9999;
    }

    function extractOrderDeliveryMinutes(order: AdminOrder): number {
        const raw = (order.deliveryRound || '').trim();
        return extractMinutesFromString(raw);
    }

    function formatThaiDateDisplay(dateStr: string): string {
        if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || 'ไม่ระบุวันที่';
        const thaiDays = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];
        const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
        const [y, m, d] = dateStr.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        const dayName = thaiDays[dateObj.getDay()];
        const monthName = thaiMonths[m - 1];
        const yearBE = y + 543;
        return `${dayName}ที่ ${d} ${monthName} ${yearBE}`;
    }

    function sortTimeBadges(entries: [string, number][]): [string, number][] {
        return entries.slice().sort((a, b) => {
            const minA = extractMinutesFromString(a[0]);
            const minB = extractMinutesFromString(b[0]);
            if (minA !== minB) return minA - minB;
            return a[0].localeCompare(b[0]);
        });
    }

    let filteredOrders = $derived(
        selectedFilter === 'all'
            ? liveOrders
            : selectedFilter === 'to_brew'
            ? liveOrders.filter((o) => o.status === 'paid' || o.status === 'brewing')
            : liveOrders.filter((o) => o.status === selectedFilter)
    );

    // 📜 ตัวแปรและการคำนวณสำหรับแท็บประวัติคำสั่งซื้อ (Order History & Archive)
    // ดึงวันเปิดร้านทั้งหมดที่มีคำสั่งซื้อ เรียงจากล่าสุดไปเก่าสุด
    let openDatesList = $derived.by(() => {
        const datesSet = new Set<string>();
        for (const o of orders) {
            const d = (o.deliveryDate || o.createdAt.slice(0, 10)).trim();
            if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
                datesSet.add(d);
            }
        }
        return Array.from(datesSet).sort((a, b) => b.localeCompare(a));
    });

    // 7 วันล่าสุดที่เปิดร้าน
    let recent7OpenDays = $derived(openDatesList.slice(0, 7));

    let historyDateRange = $state<'recent7' | 'today' | 'yesterday' | 'week' | 'all' | 'custom'>('recent7');
    let historyCustomDate = $state<string>('');
    let historyStatusFilter = $state<string>('all'); // 'all' | 'completed' | 'cancelled' | 'pending' | 'active'
    let historySearchQuery = $state<string>('');

    let historyFilteredOrders = $derived.by(() => {
        let list = orders;

        // 1. กรองตามช่วงวันที่
        if (historyDateRange === 'recent7') {
            const set7 = new Set(recent7OpenDays);
            list = list.filter((o) => set7.has((o.deliveryDate || o.createdAt.slice(0, 10)).trim()));
        } else if (historyDateRange === 'today') {
            list = list.filter((o) => (o.deliveryDate || o.createdAt.slice(0, 10)) === todayDateStr);
        } else if (historyDateRange === 'yesterday') {
            const yd = new Date();
            yd.setDate(yd.getDate() - 1);
            const ydStr = `${yd.getFullYear()}-${String(yd.getMonth() + 1).padStart(2, '0')}-${String(yd.getDate()).padStart(2, '0')}`;
            list = list.filter((o) => (o.deliveryDate || o.createdAt.slice(0, 10)) === ydStr);
        } else if (historyDateRange === 'week') {
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            const weekAgoMs = weekAgo.getTime();
            list = list.filter((o) => new Date(o.createdAt).getTime() >= weekAgoMs);
        } else if (historyDateRange === 'custom' && historyCustomDate) {
            list = list.filter((o) => (o.deliveryDate || o.createdAt.slice(0, 10)) === historyCustomDate);
        }

        // 2. กรองตามสถานะ
        if (historyStatusFilter === 'completed') {
            list = list.filter((o) => o.status === 'completed');
        } else if (historyStatusFilter === 'cancelled') {
            list = list.filter((o) => o.status === 'cancelled');
        } else if (historyStatusFilter === 'pending') {
            list = list.filter((o) => o.status === 'pending');
        } else if (historyStatusFilter === 'active') {
            list = list.filter((o) => o.status !== 'completed' && o.status !== 'cancelled');
        }

        // 3. กรองตามคำค้นหา (ชื่อ / เบอร์ / รหัสออเดอร์)
        const q = historySearchQuery.trim().toLowerCase();
        if (q) {
            list = list.filter((o) => {
                const name = (o.name || '').toLowerCase();
                const phone = (o.phone || '');
                const orderId = (o.order_id || o.id || '').toLowerCase();
                const addr = (o.address || '').toLowerCase();
                return name.includes(q) || phone.includes(q) || orderId.includes(q) || addr.includes(q);
            });
        }

        // เรียงจากออเดอร์ล่าสุดไปเก่าสุดสำหรับประวัติ
        return [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    });

    interface HistoryDayGroup {
        date: string;
        dateFormatted: string;
        isToday: boolean;
        isYesterday: boolean;
        orders: AdminOrder[];
        totalSales: number;
        totalCups: number;
        completedCount: number;
        cancelledCount: number;
        pendingCount: number;
    }

    let historyGroupedByDay = $derived.by<HistoryDayGroup[]>(() => {
        const groups = new Map<string, AdminOrder[]>();
        for (const o of historyFilteredOrders) {
            const d = (o.deliveryDate || o.createdAt.slice(0, 10)).trim() || 'ไม่ระบุวันที่';
            if (!groups.has(d)) {
                groups.set(d, []);
            }
            groups.get(d)!.push(o);
        }

        const sortedDates = Array.from(groups.keys()).sort((a, b) => b.localeCompare(a));
        const yd = new Date();
        yd.setDate(yd.getDate() - 1);
        const ydStr = `${yd.getFullYear()}-${String(yd.getMonth() + 1).padStart(2, '0')}-${String(yd.getDate()).padStart(2, '0')}`;

        return sortedDates.map((date) => {
            const dayOrders = groups.get(date)!;
            const isToday = date === todayDateStr;
            const isYesterday = date === ydStr;
            const validOrders = dayOrders.filter((o) => o.status !== 'cancelled' && o.status !== 'pending');
            const totalSales = validOrders.reduce((sum, o) => sum + (o.totalPrice || 0), 0);
            const totalCups = dayOrders.filter((o) => o.status !== 'cancelled').reduce(
                (sum, o) => sum + (o.basket || []).reduce((bS, it) => bS + Math.max(1, Number(it.quantity) || 1), 0),
                0
            );
            const completedCount = dayOrders.filter((o) => o.status === 'completed').length;
            const cancelledCount = dayOrders.filter((o) => o.status === 'cancelled').length;
            const pendingCount = dayOrders.filter((o) => o.status === 'pending').length;

            return {
                date,
                dateFormatted: formatThaiDateDisplay(date),
                isToday,
                isYesterday,
                orders: dayOrders,
                totalSales,
                totalCups,
                completedCount,
                cancelledCount,
                pendingCount
            };
        });
    });

    let expandedHistoryDays = $state<Record<string, boolean>>({});

    function isDayExpanded(date: string, index: number): boolean {
        if (expandedHistoryDays[date] !== undefined) {
            return expandedHistoryDays[date];
        }
        return index === 0;
    }

    function toggleHistoryDay(date: string, index: number) {
        const current = isDayExpanded(date, index);
        expandedHistoryDays = {
            ...expandedHistoryDays,
            [date]: !current
        };
    }

    function expandAllHistoryDays() {
        const next: Record<string, boolean> = {};
        for (const g of historyGroupedByDay) {
            next[g.date] = true;
        }
        expandedHistoryDays = next;
    }

    function collapseAllHistoryDays() {
        const next: Record<string, boolean> = {};
        for (const g of historyGroupedByDay) {
            next[g.date] = false;
        }
        expandedHistoryDays = next;
    }

    let historyTotalSales = $derived(
        historyFilteredOrders
            .filter((o) => o.status !== 'cancelled' && o.status !== 'pending')
            .reduce((sum, o) => sum + (o.totalPrice || 0), 0)
    );
    let historyCompletedCount = $derived(historyFilteredOrders.filter((o) => o.status === 'completed').length);
    let historyCancelledCount = $derived(historyFilteredOrders.filter((o) => o.status === 'cancelled').length);

    // 🍵 ระบบสรุปคิวชงเครื่องดื่มและเช็คลิสต์บาริสต้า (Barista Drink Prep Summary & Checklist)
    let isBrewSummaryExpanded = $state<boolean>(false);
    let selectedRoundFilter = $state<string>('all');
    let brewChecklist = $state<Record<string, boolean>>({});

    interface SweetnessItemPrep {
        sweetness: number;
        count: number;
        addonBreakdown: Record<string, number>;
        noteBreakdown: Record<string, number>;
        roundBreakdown: Record<string, number>;
        timeBreakdown: Record<string, number>;
        dateBreakdown: Record<string, number>;
        normalAddonCount: number;
    }

    interface MenuPrepGroup {
        menuId: string;
        menuName: string;
        isFermented: boolean;
        totalCups: number;
        sweetnessList: SweetnessItemPrep[];
        overallAddons: Record<string, number>;
        overallNotes: Record<string, number>;
        overallRounds: Record<string, number>;
        overallTimes: Record<string, number>;
        totalNormalAddon: number;
    }

    // รอบจัดส่งทั้งหมดที่มีอยู่ในคำสั่งซื้อที่ต้องชง ณ ตอนนั้น
    let availableDeliveryRounds = $derived.by(() => {
        const counts: Record<string, number> = {};
        const brewTargetOrders = liveOrders.filter((o) => o.status === 'paid' || o.status === 'brewing');
        for (const order of brewTargetOrders) {
            const rawRound = (order.deliveryRound || 'รอบปกติ').trim();
            const roundName = rawRound.split('·')[0].trim();
            const cups = (order.basket || []).reduce((sum, it) => sum + Math.max(1, Number(it.quantity) || 1), 0);
            counts[roundName] = (counts[roundName] || 0) + cups;
        }
        return counts;
    });

    let activeSummaryOrders = $derived.by(() => {
        // นับเฉพาะออเดอร์ที่ต้องชงจริง ณ ตอนนั้น (รับยอดแล้ว/กำลังชง) ตัดยกเลิก/เสร็จแล้ว/วันเก่าออกเด็ดขาด
        const brewTargetOrders = liveOrders.filter((o) => o.status === 'paid' || o.status === 'brewing');
        if (selectedRoundFilter === 'all') {
            return brewTargetOrders;
        }
        return brewTargetOrders.filter((o) => {
            const rawRound = (o.deliveryRound || 'รอบปกติ').trim();
            const roundName = rawRound.split('·')[0].trim();
            return roundName === selectedRoundFilter;
        });
    });

    let filteredTotalCups = $derived(
        activeSummaryOrders.reduce((sum, o) => {
            if (!o.basket || !Array.isArray(o.basket)) return sum;
            return sum + o.basket.reduce((bSum, item) => bSum + Math.max(1, Number(item.quantity) || 1), 0);
        }, 0)
    );

    let brewSummaryList = $derived.by<MenuPrepGroup[]>(() => {
        const menuMap = new Map<string, {
            menuId: string;
            menuName: string;
            isFermented: boolean;
            totalCups: number;
            sweetnessMap: Map<number, {
                sweetness: number;
                count: number;
                addonBreakdown: Record<string, number>;
                noteBreakdown: Record<string, number>;
                roundBreakdown: Record<string, number>;
                timeBreakdown: Record<string, number>;
                dateBreakdown: Record<string, number>;
                normalAddonCount: number;
            }>;
            overallAddons: Record<string, number>;
            overallNotes: Record<string, number>;
            overallRounds: Record<string, number>;
            overallTimes: Record<string, number>;
            totalNormalAddon: number;
        }>();

        for (const order of activeSummaryOrders) {
            if (!order.basket || !Array.isArray(order.basket)) continue;
            const rawRound = (order.deliveryRound || 'รอบปกติ').trim();
            const roundParts = rawRound.split('·').map((p) => p.trim());
            const roundName = roundParts[0] || 'รอบปกติ';
            const subTime = roundParts.length > 1 ? roundParts.slice(1).join(' · ').trim() : '';
            const timeKey = subTime ? `${roundName} · ⏰ ${subTime.replace(/^(นัดส่ง|จัดส่ง)\s*/, '')}` : roundName;
            const dateStr = (order.deliveryDate || '').trim();

            for (const item of order.basket) {
                const qty = Math.max(1, Number(item.quantity) || 1);
                const name = (item.thaiName || item.name || 'เครื่องดื่ม').trim();
                const menuId = item.id || name;
                const isFermented = name.includes('บ่ม') || (settings.fermentedItemIds || []).includes(item.id);
                const sweetness = item.sweetness !== undefined && item.sweetness !== null ? Number(item.sweetness) : 50;

                // ตรวจสอบ addon (เพิ่มช็อต / ท็อปปิ้ง)
                let addonName = item.addonName ? item.addonName.trim() : null;
                if (!addonName && item.basePrice && item.price > item.basePrice) {
                    addonName = 'เพิ่มช็อตมัทฉะ';
                }

                // ตรวจสอบหมายเหตุเฉพาะแก้ว (โน้ต)
                const note = (item.note || '').trim();

                let group = menuMap.get(name);
                if (!group) {
                    group = {
                        menuId,
                        menuName: name,
                        isFermented,
                        totalCups: 0,
                        sweetnessMap: new Map(),
                        overallAddons: {},
                        overallNotes: {},
                        overallRounds: {},
                        overallTimes: {},
                        totalNormalAddon: 0
                    };
                    menuMap.set(name, group);
                }

                group.totalCups += qty;

                // สรุป Addons ภาพรวมของเมนูนี้
                if (addonName) {
                    group.overallAddons[addonName] = (group.overallAddons[addonName] || 0) + qty;
                } else {
                    group.totalNormalAddon += qty;
                }

                // สรุป Notes ภาพรวมของเมนูนี้
                if (note) {
                    group.overallNotes[note] = (group.overallNotes[note] || 0) + qty;
                }

                // สรุป Rounds & Times ภาพรวมของเมนูนี้
                if (roundName) {
                    group.overallRounds[roundName] = (group.overallRounds[roundName] || 0) + qty;
                }
                if (timeKey) {
                    group.overallTimes[timeKey] = (group.overallTimes[timeKey] || 0) + qty;
                }

                // สรุปจำแนกตามความหวาน
                let sweetItem = group.sweetnessMap.get(sweetness);
                if (!sweetItem) {
                    sweetItem = {
                        sweetness,
                        count: 0,
                        addonBreakdown: {},
                        noteBreakdown: {},
                        roundBreakdown: {},
                        timeBreakdown: {},
                        dateBreakdown: {},
                        normalAddonCount: 0
                    };
                    group.sweetnessMap.set(sweetness, sweetItem);
                }

                sweetItem.count += qty;
                if (addonName) {
                    sweetItem.addonBreakdown[addonName] = (sweetItem.addonBreakdown[addonName] || 0) + qty;
                } else {
                    sweetItem.normalAddonCount += qty;
                }
                if (note) {
                    sweetItem.noteBreakdown[note] = (sweetItem.noteBreakdown[note] || 0) + qty;
                }
                if (roundName) {
                    sweetItem.roundBreakdown[roundName] = (sweetItem.roundBreakdown[roundName] || 0) + qty;
                }
                if (timeKey) {
                    sweetItem.timeBreakdown[timeKey] = (sweetItem.timeBreakdown[timeKey] || 0) + qty;
                }
                if (dateStr) {
                    sweetItem.dateBreakdown[dateStr] = (sweetItem.dateBreakdown[dateStr] || 0) + qty;
                }
            }
        }

        // แปลงเป็น Array และเรียงลำดับ: เมนูที่มีจำนวนแก้วเยอะกว่าอยู่บน, ความหวานเรียงจาก 0% -> 25% -> 50% -> 100%
        return Array.from(menuMap.values())
            .map((g) => ({
                menuId: g.menuId,
                menuName: g.menuName,
                isFermented: g.isFermented,
                totalCups: g.totalCups,
                overallAddons: g.overallAddons,
                overallNotes: g.overallNotes,
                overallRounds: g.overallRounds,
                overallTimes: g.overallTimes,
                totalNormalAddon: g.totalNormalAddon,
                sweetnessList: Array.from(g.sweetnessMap.values()).sort((a, b) => a.sweetness - b.sweetness)
            }))
            .sort((a, b) => b.totalCups - a.totalCups);
    });

    function getBrewItemKey(menuName: string, sweetness: number) {
        return `${menuName}__sweet_${sweetness}__round_${selectedRoundFilter}`;
    }

    let checkedCupsCount = $derived.by(() => {
        let count = 0;
        for (const menu of brewSummaryList) {
            for (const sweet of menu.sweetnessList) {
                const key = getBrewItemKey(menu.menuName, sweet.sweetness);
                if (brewChecklist[key]) {
                    count += sweet.count;
                }
            }
        }
        return count;
    });

    let brewProgressPercent = $derived(
        filteredTotalCups > 0 ? Math.round((checkedCupsCount / filteredTotalCups) * 100) : 0
    );

    function toggleChecklistItem(key: string) {
        brewChecklist = {
            ...brewChecklist,
            [key]: !brewChecklist[key]
        };
    }

    function isMenuAllChecked(menu: MenuPrepGroup): boolean {
        if (!menu.sweetnessList || menu.sweetnessList.length === 0) return false;
        return menu.sweetnessList.every(
            (s) => !!brewChecklist[getBrewItemKey(menu.menuName, s.sweetness)]
        );
    }

    function toggleMenuAll(menu: MenuPrepGroup) {
        const allChecked = isMenuAllChecked(menu);
        const nextState = !allChecked;
        const updated = { ...brewChecklist };
        for (const s of menu.sweetnessList) {
            updated[getBrewItemKey(menu.menuName, s.sweetness)] = nextState;
        }
        brewChecklist = updated;
    }

    function checkAllBrewItems() {
        const updated = { ...brewChecklist };
        for (const menu of brewSummaryList) {
            for (const s of menu.sweetnessList) {
                updated[getBrewItemKey(menu.menuName, s.sweetness)] = true;
            }
        }
        brewChecklist = updated;
    }

    function resetBrewChecklist() {
        const updated = { ...brewChecklist };
        for (const menu of brewSummaryList) {
            for (const s of menu.sweetnessList) {
                delete updated[getBrewItemKey(menu.menuName, s.sweetness)];
            }
        }
        brewChecklist = updated;
    }

    // ในแท็บ "ทั้งหมด" หรือ "คิวที่ต้องชง" ปุ่มเลือกทั้งหมดจะเลือกเฉพาะรายการที่รอชง/กำลังชงเท่านั้น
    let selectableOrders = $derived(
        selectedFilter === 'all' || selectedFilter === 'to_brew'
            ? filteredOrders.filter((o) => o.status === 'paid' || o.status === 'brewing')
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
                    settings = {
                        ...settings,
                        ...data.settings,
                        notifications: {
                            ...settings.notifications,
                            ...(data.settings.notifications || {})
                        },
                        lineOa: {
                            ...settings.lineOa,
                            ...(data.settings.lineOa || {})
                        }
                    };
                    if (Array.isArray(data.settings?.lineOa?.welcomeCardBlocks) && data.settings.lineOa.welcomeCardBlocks.length > 0) {
                        designerCardBlocks = data.settings.lineOa.welcomeCardBlocks;
                    }
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

    // ========================================================
    // 🛵 ระบบตัวช่วยในการจัดส่ง (Delivery Runner Assistant)
    // ========================================================
    let selectedDeliveryRoundFilter = $state<string>('auto'); // 'auto' | roundId | 'all'

    // ตรวจจับรอบส่งปัจจุบันตามเวลาจริง
    function detectCurrentDeliveryRoundId(): string {
        const now = new Date();
        const currentMins = now.getHours() * 60 + now.getMinutes();
        const rounds = settings.deliveryRounds || [];

        for (const r of rounds) {
            if (!r.enabled) continue;
            const match = r.timeSlot.match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
            if (match) {
                const sMins = parseInt(match[1]) * 60 + parseInt(match[2]);
                const eMins = parseInt(match[3]) * 60 + parseInt(match[4]);
                // ให้เวลาเผื่อล่วงหน้า 45 นาที และหลังปิดรอบ 60 นาที
                if (currentMins >= sMins - 45 && currentMins <= eMins + 60) {
                    return r.id;
                }
            }
        }

        // ค่าเริ่มต้นตามช่วงเวลาทั่วไป (ก่อน 11:30 ให้รอบเช้า, หลัง 11:30 ให้รอบเที่ยง)
        if (currentMins < 11 * 60 + 30) {
            return rounds.find((r) => r.id === 'morning')?.id || rounds[0]?.id || 'morning';
        } else {
            return rounds.find((r) => r.id === 'noon')?.id || rounds[1]?.id || 'noon';
        }
    }

    let activeDeliveryRoundId = $derived(
        selectedDeliveryRoundFilter === 'auto' ? detectCurrentDeliveryRoundId() : selectedDeliveryRoundFilter
    );

    // รายการออเดอร์ทั้งหมดในรอบนี้ (ของวันนี้)
    let deliveryAssistantOrders = $derived.by(() => {
        return orders.filter((o) => {
            if (o.status === 'cancelled') return false;

            // ตรวจสอบวันจัดส่ง: ตรงกับวันนี้ (หรือถ้าไม่ได้ระบุ ให้อิงวันที่สร้าง)
            const isToday = o.deliveryDate ? o.deliveryDate === todayDateStr : o.createdAt.startsWith(todayDateStr);
            if (!isToday) return false;

            // ตรวจสอบรอบจัดส่ง
            if (activeDeliveryRoundId !== 'all') {
                const targetRound = settings.deliveryRounds.find((r) => r.id === activeDeliveryRoundId);
                const matchesId = o.deliveryRoundId === activeDeliveryRoundId;
                const matchesName = targetRound && (o.deliveryRound || '').includes(targetRound.name);
                if (!matchesId && !matchesName) return false;
            }

            return true;
        });
    });

    // ออเดอร์ที่ค้างส่ง (รอชง / กำลังชง / พร้อมส่ง / กำลังนำส่ง) เรียงตามเวลาที่ต้องส่ง (เร็วไปช้า)
    let pendingDeliveryOrders = $derived.by(() => {
        const list = deliveryAssistantOrders.filter((o) => o.status !== 'completed');
        return list.slice().sort((a, b) => {
            const timeA = extractOrderDeliveryMinutes(a);
            const timeB = extractOrderDeliveryMinutes(b);
            if (timeA !== timeB) return timeA - timeB;
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });
    });

    // ออเดอร์ที่ส่งเสร็จแล้วในรอบนี้
    let completedDeliveryOrders = $derived(
        deliveryAssistantOrders.filter((o) => o.status === 'completed')
    );

    let showCompletedDeliveryList = $state(false);

    // ฟังก์ชันกดยืนยันการจัดส่งเมื่อแตะการ์ด
    async function handleConfirmDelivery(order: AdminOrder) {
        const result = await swal.fire({
            title: 'ยืนยันการจัดส่งสำเร็จ? 🛵',
            html: `
                <div style="text-align: left; font-size: 0.92rem; line-height: 1.55; color: #334155;">
                    <p style="margin: 0 0 0.5rem 0;">ส่งมอบเครื่องดื่มให้:</p>
                    <div style="background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 12px; padding: 0.75rem 0.9rem; margin-bottom: 0.65rem;">
                        <strong style="color: #14532d; font-size: 1.05rem;">คุณ ${order.name}${order.memberName && order.memberName.trim() !== order.name.trim() ? ` (${order.memberName})` : ''}</strong><br/>
                        <span style="color: #166534; font-weight: 700;">📍 ${order.address}</span>
                    </div>
                    <div style="background: #f8fafc; border-radius: 8px; padding: 0.5rem 0.75rem; font-size: 0.82rem; color: #64748b;">
                        🔔 ระบบจะอัปเดตสถานะเป็น "ส่งสำเร็จ" พร้อมส่งการแจ้งเตือนไปยังลูกค้าอัตโนมัติค่ะ
                    </div>
                </div>
            `,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#16a34a',
            cancelButtonColor: '#94a3b8',
            confirmButtonText: '✅ ยืนยันส่งสำเร็จ',
            cancelButtonText: 'ยกเลิก',
            reverseButtons: true
        });

        if (result.isConfirmed) {
            await updateStatus(order.id, 'completed');
            swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: `จัดส่งออเดอร์ ${order.order_id} สำเร็จแล้ว 🛵`,
                text: 'แจ้งเตือนลูกค้าและบันทึกแต้มเรียบร้อยแล้วค่ะ',
                showConfirmButton: false,
                timer: 2500
            });
        }
    }

    // 🔔 ทดสอบส่งการแจ้งเตือน (Admin Notification Test)
    let testNotifPhone = $state('');
    let isSendingTestNotif = $state(false);

    async function sendTestNotification() {
        if (!testNotifPhone.trim()) {
            swal.fire({
                icon: 'warning',
                title: 'กรุณาระบุเบอร์โทร',
                text: 'กรอกเบอร์โทรลูกค้าหรือสมาชิกที่ต้องการทดสอบส่งนะคะ'
            });
            return;
        }

        isSendingTestNotif = true;
        try {
            const res = await fetch('/api/notifications/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: testNotifPhone.trim() })
            });
            const data = await res.json();
            if (data.success) {
                swal.fire({
                    icon: 'success',
                    title: 'ส่งแจ้งเตือนสำเร็จ! 🔔',
                    text: data.message
                });
            } else {
                swal.fire({
                    icon: 'info',
                    title: 'ส่งไม่สำเร็จ',
                    text: data.message || 'ยังไม่มีอุปกรณ์ที่เปิดรับการแจ้งเตือนสำหรับเบอร์นี้ค่ะ'
                });
            }
        } catch {
            swal.fire('ข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์แจ้งเตือนได้', 'error');
        } finally {
            isSendingTestNotif = false;
        }
    }

    // ========================================================
    // 💬 ระบบจัดการ LINE Official Account (LINE OA)
    // ========================================================
    let lineUsersList = $state<any[]>([]);
    let isLoadingLineUsers = $state(false);
    let lineTestMessageInput = $state('สวัสดีค่ะ! ทดสอบส่งข้อความจากระบบ Home Matcha Cafe 🍵✨ เชื่อมต่อสำเร็จสมบูรณ์แล้วค่ะ');
    let isSendingLineTest = $state(false);
    let webhookCopied = $state(false);
    let isLineTokenVisible = $state(false);
    let lineOaSubTab = $state<'connection' | 'notifications' | 'bot' | 'designer' | 'users'>('connection');
    let designerMobileTab = $state<'blocks' | 'preview'>('blocks');

    // Modal เพิ่ม/แก้ไข Keyword
    let editingKeywordModal = $state<{
        isNew: boolean;
        id: string;
        keyword: string;
        matchType: 'exact' | 'contains';
        replyType: 'text' | 'flex_menu' | 'flex_status' | 'flex_loyalty';
        replyText: string;
        enabled: boolean;
    } | null>(null);

    async function loadLineUsers() {
        isLoadingLineUsers = true;
        try {
            const res = await fetch('/api/line/users');
            if (res.ok) {
                const data = await res.json();
                lineUsersList = data.users || [];
            }
        } catch (e) {
            console.error('Error loading line users:', e);
        } finally {
            isLoadingLineUsers = false;
        }
    }

    async function sendLineTestPushMessage(statusType?: string) {
        if (!settings.lineOa.channelAccessToken) {
            swal.fire({
                icon: 'warning',
                title: 'ยังไม่ได้ระบุ Token',
                text: 'กรุณากรอก Channel Access Token ก่อนทดสอบส่งนะคะ',
                confirmButtonColor: '#166534'
            });
            return;
        }
        isSendingLineTest = true;
        try {
            const res = await fetch('/api/line/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetUserId: settings.lineOa.adminLineUserId,
                    targetPhone: settings.lineOa.adminPhone,
                    message: lineTestMessageInput,
                    statusType: statusType || undefined,
                    testVars
                })
            });
            const data = await res.json();
            if (data.success) {
                swal.fire({
                    icon: 'success',
                    title: statusType ? 'ยิงการ์ดสถานะสำเร็จ! 🍵' : 'ส่งข้อความสำเร็จ! 💬',
                    text: data.message,
                    confirmButtonColor: '#166534'
                });
            } else {
                swal.fire({
                    icon: 'error',
                    title: 'ส่งไม่สำเร็จ',
                    text: data.message || 'โปรดตรวจสอบ Channel Access Token อีกครั้งค่ะ',
                    confirmButtonColor: '#dc2626'
                });
            }
        } catch (e: any) {
            swal.fire('ข้อผิดพลาด', e?.message || 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', 'error');
        } finally {
            isSendingLineTest = false;
        }
    }

    function copyWebhookUrl() {
        const url = 'https://homematchacafe.store/api/line/webhook';
        navigator.clipboard.writeText(url);
        webhookCopied = true;
        setTimeout(() => { webhookCopied = false; }, 2500);
        swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: 'คัดลอก Webhook URL สำเร็จ! 📋',
            showConfirmButton: false,
            timer: 2000
        });
    }

    function openAddKeywordModal() {
        editingKeywordModal = {
            isNew: true,
            id: `kw-${Date.now()}`,
            keyword: '',
            matchType: 'contains',
            replyType: 'text',
            replyText: '',
            enabled: true
        };
    }

    function openEditKeywordModal(k: LineOaKeywordReply) {
        editingKeywordModal = {
            isNew: false,
            id: k.id,
            keyword: k.keyword,
            matchType: k.matchType,
            replyType: k.replyType,
            replyText: k.replyText || '',
            enabled: k.enabled !== false
        };
    }

    function saveKeywordModal() {
        if (!editingKeywordModal) return;
        if (!editingKeywordModal.keyword.trim()) {
            swal.fire({ icon: 'warning', title: 'กรุณาระบุคำค้นหา (Keyword)', confirmButtonColor: '#166534' });
            return;
        }

        const newKw: LineOaKeywordReply = {
            id: editingKeywordModal.id,
            keyword: editingKeywordModal.keyword.trim(),
            matchType: editingKeywordModal.matchType,
            replyType: editingKeywordModal.replyType,
            replyText: editingKeywordModal.replyText.trim(),
            enabled: editingKeywordModal.enabled
        };

        if (editingKeywordModal.isNew) {
            settings.lineOa.keywordReplies = [...(settings.lineOa.keywordReplies || []), newKw];
        } else {
            settings.lineOa.keywordReplies = (settings.lineOa.keywordReplies || []).map(k => k.id === newKw.id ? newKw : k);
        }
        editingKeywordModal = null;
        saveAllSettings();
    }

    function deleteKeyword(id: string) {
        settings.lineOa.keywordReplies = (settings.lineOa.keywordReplies || []).filter(k => k.id !== id);
        saveAllSettings();
    }

    // 🎨 ระบบออกแบบการ์ดลูกค้า Visual Flex Card Designer
    interface DesignerCardBlock {
        id: string;
        type: 'banner' | 'tag' | 'title' | 'body' | 'highlight' | 'button';
        imageUrl?: string;
        aspectRatio?: '20:13' | '16:9' | '4:3' | '1:1' | '3:2' | '3:4' | '9:16' | string;
        aspectMode?: 'cover' | 'fit';
        imageSize?: 'full' | '5xl' | '4xl' | '3xl' | 'xxl' | 'xl' | 'lg' | string;
        tagText?: string;
        tagColor?: string;
        tagBg?: string;
        titleText?: string;
        titleSize?: 'md' | 'lg' | 'xl';
        bodyText?: string;
        highlightText?: string;
        buttonLabel?: string;
        buttonUrl?: string;
        buttonStyle?: 'primary' | 'secondary' | 'gold' | 'outline';
        buttonAction?: 'custom' | 'register' | 'menu' | 'loyalty' | 'order';
    }

    // 🐱 คลังรูปภาพมาสคอตน้องแมว 2D Home Matcha Cafe (ตามอารมณ์ต่างๆ)
    const catMascots = [
        {
            id: 'welcome',
            shortName: '👋 ต้อนรับ',
            name: '👋 ต้อนรับเพื่อนใหม่',
            desc: 'แมวยกมือทักทายถือถ้วยมัทฉะ ยิ้มต้อนรับอบอุ่น',
            url: 'https://homematchacafe.store/image/mascot/cat-welcome.jpg'
        },
        {
            id: 'brewing',
            shortName: '🍵 กำลังชง',
            name: '🍵 บาริสต้ากำลังชง',
            desc: 'แมวใส่ผ้ากันเปื้อนบาริสต้า ตีมัทฉะควันกรุ่นด้วยแปรงชาเซ็น',
            url: 'https://homematchacafe.store/image/mascot/cat-brewing.jpg'
        },
        {
            id: 'ready',
            shortName: '✨ ชงเสร็จ',
            name: '✨ ชงเสร็จพร้อมส่ง',
            desc: 'แมวยิ้มสดใสถือแก้วมัทฉะลาเต้เย็นประกายวิบวับ',
            url: 'https://homematchacafe.store/image/mascot/cat-ready.jpg'
        },
        {
            id: 'delivery',
            shortName: '🛵 กำลังส่ง',
            name: '🛵 ไรเดอร์กำลังส่ง',
            desc: 'แมวใส่หมวกกันน็อกขี่มินิสกูตเตอร์ส่งชาพร้อมกล่องเดลิเวอรี่',
            url: 'https://homematchacafe.store/image/mascot/cat-delivery.jpg'
        },
        {
            id: 'completed',
            shortName: '🎉 ส่งสำเร็จ',
            name: '🎉 ส่งมอบสำเร็จ/ขอบคุณ',
            desc: 'แมวดีใจสุดๆ แจกนิ้วโป้งเยี่ยมพร้อมหัวใจชมพูหวาน',
            url: 'https://homematchacafe.store/image/mascot/cat-completed.jpg'
        },
        {
            id: 'loyalty',
            shortName: '⭐ สะสมแต้ม',
            name: '⭐ สะสมแต้ม/สิทธิพิเศษ',
            desc: 'แมวถือดาวทองและบัตรสะสมแต้มประกายระยิบระยับ',
            url: 'https://homematchacafe.store/image/mascot/cat-loyalty.jpg'
        },
        {
            id: 'cancelled',
            shortName: '❌ ยกเลิก/ขออภัย',
            name: '❌ ขออภัย/ยกเลิกออเดอร์',
            desc: 'แมวหูตกตาละห้อยไหว้ขอโทษอย่างสุภาพ มีเหงื่อตกน่ารักน่าเอ็นดู',
            url: 'https://homematchacafe.store/image/mascot/cat-cancelled.jpg'
        }
    ];

    let designerAltText = $state('🍵 Home Matcha Cafe มีข้อความใหม่ถึงคุณ');
    let designerCardBlocks = $state<DesignerCardBlock[]>([
        {
            id: 'b-banner',
            type: 'banner',
            imageUrl: 'https://homematchacafe.store/image/mascot/cat-welcome.jpg',
            aspectRatio: '1:1'
        },
        {
            id: 'b-tag',
            type: 'tag',
            tagText: '🍵 เมนูมัทฉะแนะนำประจำสัปดาห์',
            tagBg: '#dcfce7',
            tagColor: '#166534'
        },
        {
            id: 'b-title',
            type: 'title',
            titleText: 'Cold-Fermented Matcha Oat Latte',
            titleSize: 'lg'
        },
        {
            id: 'b-body',
            type: 'body',
            bodyText: 'มัทฉะเกรดพิธีการสกัดเย็น 24 ชั่วโมง กลิ่นหอมอูมามิละมุน ผสานกับโอ๊ตมิลค์รสชาตินุ่มลึก สั่งจองล่วงหน้าได้เลยค่ะ'
        },
        {
            id: 'b-highlight',
            type: 'highlight',
            highlightText: '✨ ราคาพิเศษ 65.- (ปกติ 75.-)'
        },
        {
            id: 'b-btn-1',
            type: 'button',
            buttonLabel: '🍵 สั่งเครื่องดื่มทันที',
            buttonUrl: 'https://homematchacafe.store/menu',
            buttonStyle: 'primary'
        },
        {
            id: 'b-btn-2',
            type: 'button',
            buttonLabel: '⭐ ตรวจสอบแต้มสะสม',
            buttonUrl: 'https://homematchacafe.store/loyalty',
            buttonStyle: 'outline'
        }
    ]);

    let isSendingDesignerCard = $state(false);
    let designerTarget = $state<'admin' | 'broadcast'>('admin');
    let draggedBlockIdx = $state<number | null>(null);

    let designerHeroBlock = $derived(designerCardBlocks.find(b => b.type === 'banner' && b.imageUrl));
    let designerBodyBlocks = $derived(designerCardBlocks.filter(b => b.type !== 'banner' && b.type !== 'button'));
    let designerFooterBlocks = $derived(designerCardBlocks.filter(b => b.type === 'button' && b.buttonLabel));

    let testVars = $state({
        orderCode: 'HM-8899',
        itemsSummary: '🍵 Cold-Fermented Oat Milk Matcha Latte x1\n🍵 Clear Matcha Cold Whisk x1',
        totalPrice: '฿165',
        customerName: 'คุณลูกค้า',
        phone: '0812345678',
        points: '10',
        pin: '1234'
    });
    let showTestVars = $state(false);

    function addDesignerBlock(type: DesignerCardBlock['type']) {
        const id = `blk-${Date.now()}`;
        if (type === 'banner') {
            designerCardBlocks = [...designerCardBlocks, { 
                id, 
                type, 
                imageUrl: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?auto=format&fit=crop&w=800&q=80', 
                aspectRatio: '1:1',
                aspectMode: 'cover',
                imageSize: 'full'
            }];
        } else if (type === 'tag') {
            designerCardBlocks = [...designerCardBlocks, { id, type, tagText: '🔥 โปรโมชั่นพิเศษ', tagBg: '#fef3c7', tagColor: '#b45309' }];
        } else if (type === 'title') {
            designerCardBlocks = [...designerCardBlocks, { id, type, titleText: 'หัวข้อการ์ดโปรโมชั่น', titleSize: 'lg' }];
        } else if (type === 'body') {
            designerCardBlocks = [...designerCardBlocks, { id, type, bodyText: 'ระบุรายละเอียดข้อความที่คุณต้องการส่งให้ลูกค้าที่นี่...' }];
        } else if (type === 'highlight') {
            designerCardBlocks = [...designerCardBlocks, { id, type, highlightText: '🎉 ซื้อ 2 แถม 1 ถึงสิ้นเดือนนี้เท่านั้น!' }];
        } else if (type === 'button') {
            designerCardBlocks = [...designerCardBlocks, { id, type, buttonLabel: '👉 ดูรายละเอียดเพิ่มเติม', buttonUrl: 'https://homematchacafe.store/menu', buttonStyle: 'primary' }];
        }
    }

    function removeDesignerBlock(id: string) {
        designerCardBlocks = designerCardBlocks.filter(b => b.id !== id);
    }

    function moveDesignerBlock(idx: number, dir: 'up' | 'down') {
        const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= designerCardBlocks.length) return;
        const copy = [...designerCardBlocks];
        const temp = copy[idx];
        copy[idx] = copy[targetIdx];
        copy[targetIdx] = temp;
        designerCardBlocks = copy;
    }

    function replacePreviewVars(text?: string): string {
        if (!text) return '';
        return text
            .replace(/\{orderCode\}/g, testVars.orderCode || 'HM-8899')
            .replace(/\{totalPrice\}/g, testVars.totalPrice || '฿165')
            .replace(/\{customerName\}/g, testVars.customerName || 'คุณลูกค้า')
            .replace(/\{name\}/g, testVars.customerName || 'คุณลูกค้า')
            .replace(/\{phone\}/g, testVars.phone || '0812345678')
            .replace(/\{pin\}/g, testVars.pin || '1234')
            .replace(/\{points\}/g, testVars.points || '10')
            .replace(/\{itemsSummary\}/g, testVars.itemsSummary || 'Cold-Fermented Oat Milk Matcha Latte x1')
            .replace(/\{url\}/g, 'https://homematchacafe.store/order')
            .replace(/\{trackingUrl\}/g, 'https://homematchacafe.store/order')
            .replace(/\{loyaltyUrl\}/g, 'https://homematchacafe.store/loyalty')
            .replace(/\{registerUrl\}/g, `https://homematchacafe.store/loyalty?action=register&phone=${testVars.phone || '0812345678'}`)
            .replace(/\{menuUrl\}/g, 'https://homematchacafe.store/menu');
    }

    function loadDesignerPreset(preset: 'promo' | 'loyalty' | 'delivery' | 'welcome' | 'register' | 'member' | 'status_order_created' | 'status_slip_approved' | 'status_member_registered' | 'status_brewing' | 'status_ready' | 'status_delivering' | 'status_completed' | 'status_cancelled') {
        const now = Date.now();
        if (preset === 'welcome') {
            designerCardBlocks = [
                { id: `b-${now}-1`, type: 'banner', imageUrl: 'https://homematchacafe.store/image/mascot/cat-welcome.jpg', aspectRatio: '1:1' },
                { id: `b-${now}-2`, type: 'tag', tagText: '🍵 ยินดีต้อนรับสู่ Home Matcha Cafe', tagBg: '#dcfce7', tagColor: '#166534' },
                { id: `b-${now}-3`, type: 'title', titleText: 'ยินดีต้อนรับเพื่อนใหม่นะคะ ✨', titleSize: 'lg' },
                { id: `b-${now}-4`, type: 'body', bodyText: 'ขอบคุณที่แอดไลน์ร้าน Home Matcha Cafe ค่ะ คุณสามารถกดสั่งซื้อเครื่องดื่มออนไลน์ สะสมแต้ม หรือเช็คสถานะออเดอร์ได้ทันทีจากปุ่มด้านล่างเลยนะคะ' },
                { id: `b-${now}-5`, type: 'highlight', highlightText: '💡 พิมพ์เบอร์โทรศัพท์ 10 หลัก เพื่อผูกบัญชีรับแจ้งเตือนสถานะออเดอร์นะคะ 🍵' },
                { id: `b-${now}-6`, type: 'button', buttonLabel: '🍵 สั่งเครื่องดื่มออนไลน์', buttonUrl: 'https://homematchacafe.store/menu', buttonStyle: 'primary' },
                { id: `b-${now}-7`, type: 'button', buttonLabel: '⭐ เปิดบัตรสะสมแต้ม 10 แก้วฟรี', buttonUrl: 'https://homematchacafe.store/loyalty', buttonStyle: 'gold' },
                { id: `b-${now}-8`, type: 'button', buttonLabel: '📍 เช็ครอบจัดส่งวันนี้', buttonUrl: 'https://homematchacafe.store/order', buttonStyle: 'outline' }
            ];
        } else if (preset === 'status_order_created') {
            designerCardBlocks = [
                { id: `b-${now}-1`, type: 'banner', imageUrl: 'https://homematchacafe.store/image/mascot/cat-welcome.jpg', aspectRatio: '1:1' },
                { id: `b-${now}-2`, type: 'tag', tagText: '📝 ได้รับคำสั่งซื้อแล้ว', tagBg: '#f0fdf4', tagColor: '#166534' },
                { id: `b-${now}-3`, type: 'title', titleText: 'ได้รับออเดอร์ #{orderCode} แล้วค่ะ ✨', titleSize: 'lg' },
                { id: `b-${now}-4`, type: 'body', bodyText: 'ทางร้านได้รับคำสั่งซื้อของคุณเรียบร้อยแล้วค่ะ กรุณาตรวจสอบยอดชำระและแนบสลิปโอนเงิน เพื่อให้บาริสต้าเริ่มคิวชงนะคะ 🍵\n{itemsSummary}' },
                { id: `b-${now}-5`, type: 'highlight', highlightText: '🧾 ยอดชำระ: {totalPrice} บ. (กรุณาแนบสลิป)' },
                { id: `b-${now}-6`, type: 'button', buttonLabel: '🧾 แนบสลิป / ดูออเดอร์', buttonUrl: 'https://homematchacafe.store/success?orderCode={orderCode}&phone={phone}', buttonStyle: 'primary' },
                { id: `b-${now}-7`, type: 'button', buttonLabel: '⭐ บัตรสะสมแต้มของฉัน', buttonUrl: 'https://homematchacafe.store/loyalty?phone={phone}', buttonStyle: 'gold' }
            ];
        } else if (preset === 'status_slip_approved') {
            designerCardBlocks = [
                { id: `b-${now}-1`, type: 'banner', imageUrl: 'https://homematchacafe.store/image/mascot/cat-ready.jpg', aspectRatio: '1:1' },
                { id: `b-${now}-2`, type: 'tag', tagText: '💳 ตรวจสอบสลิปเรียบร้อยแล้ว', tagBg: '#dcfce7', tagColor: '#15803d' },
                { id: `b-${now}-3`, type: 'title', titleText: 'อนุมัติการชำระเงินออเดอร์ #{orderCode} ✨', titleSize: 'lg' },
                { id: `b-${now}-4`, type: 'body', bodyText: 'ทางร้านตรวจสอบสลิปโอนเงินเรียบร้อยแล้วค่ะ กำลังเตรียมคิวส่งต่อให้บาริสต้าเริ่มชงนะคะ 🍵\n{itemsSummary}' },
                { id: `b-${now}-5`, type: 'highlight', highlightText: '🧾 ยอดชำระสำเร็จ: {totalPrice} บ. เข้าสู่คิวชงเรียบร้อย' },
                { id: `b-${now}-6`, type: 'button', buttonLabel: '🧾 ดูใบเสร็จ & สถานะออเดอร์', buttonUrl: 'https://homematchacafe.store/success?orderCode={orderCode}&phone={phone}', buttonStyle: 'primary' },
                { id: `b-${now}-7`, type: 'button', buttonLabel: '⭐ บัตรสะสมแต้มของฉัน', buttonUrl: 'https://homematchacafe.store/loyalty', buttonStyle: 'gold' }
            ];
        } else if (preset === 'status_member_registered') {
            designerCardBlocks = [
                { id: `b-${now}-1`, type: 'banner', imageUrl: 'https://homematchacafe.store/image/mascot/cat-loyalty.jpg', aspectRatio: '1:1' },
                { id: `b-${now}-2`, type: 'tag', tagText: '🎉 สมัครสมาชิกสำเร็จเรียบร้อย', tagBg: '#dcfce7', tagColor: '#166534' },
                { id: `b-${now}-3`, type: 'title', titleText: 'ยินดีต้อนรับสู่ระบบสมาชิกค่ะ ✨', titleSize: 'lg' },
                { id: `b-${now}-4`, type: 'body', bodyText: 'คุณได้สมัครสมาชิกกับร้าน Home Matcha Cafe สำเร็จเรียบร้อยแล้วค่ะ!\nเบอร์โทรศัพท์: {phone}\nรหัส PIN สำหรับเข้าสู่ระบบ: {pin}' },
                { id: `b-${now}-5`, type: 'highlight', highlightText: '🔐 จดจำรหัส PIN 4 หลักนี้ไว้เพื่อใช้เข้าสู่ระบบสะสมแต้มนะคะ' },
                { id: `b-${now}-6`, type: 'button', buttonLabel: '⭐ เปิดบัตรสะสมแต้มของฉัน', buttonUrl: 'https://homematchacafe.store/loyalty?phone={phone}', buttonStyle: 'gold' },
                { id: `b-${now}-7`, type: 'button', buttonLabel: '🍵 สั่งเครื่องดื่มออนไลน์', buttonUrl: 'https://homematchacafe.store/menu', buttonStyle: 'primary' }
            ];
        } else if (preset === 'member') {
            designerCardBlocks = [
                { id: `b-${now}-1`, type: 'banner', imageUrl: 'https://homematchacafe.store/image/mascot/cat-completed.jpg', aspectRatio: '1:1' },
                { id: `b-${now}-2`, type: 'tag', tagText: '✅ สมาชิกคนพิเศษ Home Matcha Cafe', tagBg: '#dcfce7', tagColor: '#166534' },
                { id: `b-${now}-3`, type: 'title', titleText: 'ยินดีต้อนรับกลับค่ะคุณ {name} ✨', titleSize: 'lg' },
                { id: `b-${now}-4`, type: 'body', bodyText: 'ระบบเชื่อมต่อ LINE กับเบอร์ {phone} สำเร็จเรียบร้อยแล้วค่ะ! ขณะนี้คุณมีคะแนนสะสม {points} ดวง พร้อมรับแจ้งเตือนสถานะออเดอร์สดทางนี้ได้ทันที' },
                { id: `b-${now}-5`, type: 'highlight', highlightText: '⭐ สะสมครบ 10 แต้ม แลกรับเครื่องดื่มฟรี 1 แก้ว' },
                { id: `b-${now}-6`, type: 'button', buttonLabel: '⭐ เปิดบัตรสะสมแต้มของฉัน', buttonUrl: '{loyaltyUrl}', buttonStyle: 'gold', buttonAction: 'loyalty' },
                { id: `b-${now}-7`, type: 'button', buttonLabel: '🍵 สั่งเครื่องดื่มออนไลน์', buttonUrl: 'https://homematchacafe.store/menu', buttonStyle: 'primary', buttonAction: 'menu' }
            ];
        } else if (preset === 'register') {
            designerCardBlocks = [
                { id: `b-${now}-1`, type: 'banner', imageUrl: 'https://homematchacafe.store/image/mascot/cat-loyalty.jpg', aspectRatio: '1:1' },
                { id: `b-${now}-2`, type: 'tag', tagText: '✨ สิทธิพิเศษสำหรับสมาชิก Home Matcha Cafe', tagBg: '#fdf2f8', tagColor: '#9d174d' },
                { id: `b-${now}-3`, type: 'title', titleText: 'สมัครสมาชิกสะสมแต้ม 10 แก้วฟรี 🍵', titleSize: 'lg' },
                { id: `b-${now}-4`, type: 'body', bodyText: 'ระบบบันทึกเบอร์โทรศัพท์ของคุณเรียบร้อยแล้วค่ะ! กดสมัครสมาชิกเพื่อรับแต้มสะสมทันทีทุกแก้วที่สั่ง และรับแจ้งเตือนสถานะออเดอร์สดผ่าน LINE ฟรี' },
                { id: `b-${now}-5`, type: 'highlight', highlightText: '💡 กดปุ่มด้านล่างเพื่อเปิดหน้าสมัคร (ระบบจะกรอกเบอร์โทรให้อัตโนมัติค่ะ)' },
                { id: `b-${now}-6`, type: 'button', buttonLabel: '✨ สมัครสมาชิกสะสมแต้มทันที', buttonUrl: 'https://homematchacafe.store/loyalty?action=register&phone={phone}', buttonStyle: 'gold', buttonAction: 'register' },
                { id: `b-${now}-7`, type: 'button', buttonLabel: '🍵 ดูเมนูสั่งเครื่องดื่ม', buttonUrl: 'https://homematchacafe.store/menu', buttonStyle: 'primary', buttonAction: 'menu' }
            ];
        } else if (preset === 'status_brewing') {
            designerCardBlocks = [
                { id: `b-${now}-1`, type: 'banner', imageUrl: 'https://homematchacafe.store/image/mascot/cat-brewing.jpg', aspectRatio: '1:1' },
                { id: `b-${now}-2`, type: 'tag', tagText: '🍵 บาริสต้าเริ่มชงเครื่องดื่ม', tagBg: '#ccfbf1', tagColor: '#0f766e' },
                { id: `b-${now}-3`, type: 'title', titleText: 'กำลังชงออเดอร์ #{orderCode} สดใหม่ค่ะ ✨', titleSize: 'lg' },
                { id: `b-${now}-4`, type: 'body', bodyText: 'ร้านตรวจสอบยอดชำระเรียบร้อยแล้ว และกำลังตั้งใจตีมัทฉะสดใหม่ถ้วยต่อถ้วยด้วยแปรงไม้ไผ่ชาเซ็นตามสูตรดั้งเดิมค่ะ 🍵\n{itemsSummary}' },
                { id: `b-${now}-5`, type: 'highlight', highlightText: '⏳ กำลังเตรียมการจัดส่งตามรอบเวลาที่คุณระบุค่ะ' },
                { id: `b-${now}-6`, type: 'button', buttonLabel: '🔍 ติดตามสถานะออเดอร์สด', buttonUrl: '{url}', buttonStyle: 'primary' }
            ];
        } else if (preset === 'status_ready') {
            designerCardBlocks = [
                { id: `b-${now}-1`, type: 'banner', imageUrl: 'https://homematchacafe.store/image/mascot/cat-ready.jpg', aspectRatio: '1:1' },
                { id: `b-${now}-2`, type: 'tag', tagText: '✨ ชงเสร็จแล้ว แพ็กพร้อมส่ง', tagBg: '#d1fae5', tagColor: '#065f46' },
                { id: `b-${now}-3`, type: 'title', titleText: 'เครื่องดื่มออเดอร์ #{orderCode} พร้อมส่งแล้วค่ะ 🍵', titleSize: 'lg' },
                { id: `b-${now}-4`, type: 'body', bodyText: 'บาริสต้าชงเสร็จเรียบร้อยและบรรจุลงถุงเก็บความเย็นอย่างดี พร้อมให้ไรเดอร์ออกนำส่งตามรอบจัดส่งแล้วค่ะ ✨\n{itemsSummary}' },
                { id: `b-${now}-5`, type: 'highlight', highlightText: '📦 บรรจุในถุงเก็บความเย็นพร้อมจัดส่ง' },
                { id: `b-${now}-6`, type: 'button', buttonLabel: '🔍 ตรวจสอบรอบเวลาจัดส่ง', buttonUrl: '{url}', buttonStyle: 'primary' }
            ];
        } else if (preset === 'status_delivering') {
            designerCardBlocks = [
                { id: `b-${now}-1`, type: 'banner', imageUrl: 'https://homematchacafe.store/image/mascot/cat-delivery.jpg', aspectRatio: '1:1' },
                { id: `b-${now}-2`, type: 'tag', tagText: '🛵 ไรเดอร์กำลังนำส่งถึงที่', tagBg: '#e0f2fe', tagColor: '#0369a1' },
                { id: `b-${now}-3`, type: 'title', titleText: 'ไรเดอร์กำลังนำส่งออเดอร์ #{orderCode} ค่ะ! ✨', titleSize: 'lg' },
                { id: `b-${now}-4`, type: 'body', bodyText: 'ไรเดอร์ออกเดินทางนำส่งเครื่องดื่มไปยังตึก/แผนกของคุณแล้วค่ะ กรุณารอรับสายโทรศัพท์หรือรอรับเครื่องดื่มที่จุดนัดส่งนะคะ 🛵' },
                { id: `b-${now}-5`, type: 'highlight', highlightText: '🛵 ไรเดอร์กำลังเดินทางไปยังจุดนัดส่ง' },
                { id: `b-${now}-6`, type: 'button', buttonLabel: '📍 ตรวจสอบจุดนัดรับ / แผนที่', buttonUrl: '{url}', buttonStyle: 'primary' }
            ];
        } else if (preset === 'status_completed') {
            designerCardBlocks = [
                { id: `b-${now}-1`, type: 'banner', imageUrl: 'https://homematchacafe.store/image/mascot/cat-completed.jpg', aspectRatio: '1:1' },
                { id: `b-${now}-2`, type: 'tag', tagText: '🎉 จัดส่งสำเร็จเรียบร้อย', tagBg: '#dcfce7', tagColor: '#166534' },
                { id: `b-${now}-3`, type: 'title', titleText: 'ส่งมอบเครื่องดื่มออเดอร์ #{orderCode} เรียบร้อยค่ะ! 🍵', titleSize: 'lg' },
                { id: `b-${now}-4`, type: 'body', bodyText: 'ขอบคุณที่อุดหนุน Home Matcha Cafe นะคะ หวังว่าคุณจะประทับใจในรสชาติมัทฉะแก้วโปรดในวันนี้นะคะ ✨\nระบบได้บันทึกแต้มสะสมเข้าบัตรของคุณเรียบร้อยแล้วค่ะ' },
                { id: `b-${now}-5`, type: 'highlight', highlightText: '⭐ สะสมครบ 10 แต้ม แลกรับเครื่องดื่มฟรี 1 แก้ว' },
                { id: `b-${now}-6`, type: 'button', buttonLabel: '⭐ เปิดดูบัตรสะสมแต้มของฉัน', buttonUrl: 'https://homematchacafe.store/loyalty', buttonStyle: 'gold' },
                { id: `b-${now}-7`, type: 'button', buttonLabel: '🍵 สั่งเครื่องดื่มอีกครั้ง', buttonUrl: 'https://homematchacafe.store/menu', buttonStyle: 'primary' }
            ];
        } else if (preset === 'status_cancelled') {
            designerCardBlocks = [
                { id: `b-${now}-1`, type: 'banner', imageUrl: 'https://homematchacafe.store/image/mascot/cat-cancelled.jpg', aspectRatio: '1:1' },
                { id: `b-${now}-2`, type: 'tag', tagText: '❌ แจ้งยกเลิกออเดอร์', tagBg: '#fee2e2', tagColor: '#991b1b' },
                { id: `b-${now}-3`, type: 'title', titleText: 'ออเดอร์ #{orderCode} ถูกยกเลิกเรียบร้อยค่ะ', titleSize: 'lg' },
                { id: `b-${now}-4`, type: 'body', bodyText: 'ทางร้าน Home Matcha Cafe ขออภัยเป็นอย่างยิ่ง ออเดอร์ของคุณถูกยกเลิกแล้ว หากมีข้อสงสัยหรือติดขัดเรื่องการชำระเงิน สามารถติดต่อแอดมินทาง LINE ได้เลยนะคะ' },
                { id: `b-${now}-5`, type: 'highlight', highlightText: '🙏 ทางร้านกราบขออภัยในความไม่สะดวกเป็นอย่างยิ่งค่ะ' },
                { id: `b-${now}-6`, type: 'button', buttonLabel: '💬 ติดต่อแอดมินทาง LINE', buttonUrl: 'https://line.me/R/ti/p/@719wvlgi', buttonStyle: 'primary' }
            ];
        } else if (preset === 'promo') {
            designerCardBlocks = [
                { id: `b-${now}-1`, type: 'banner', imageUrl: 'https://homematchacafe.store/image/mascot/cat-ready.jpg', aspectRatio: '1:1' },
                { id: `b-${now}-2`, type: 'tag', tagText: '🍵 เมนูใหม่ประจำสัปดาห์', tagBg: '#dcfce7', tagColor: '#166534' },
                { id: `b-${now}-3`, type: 'title', titleText: 'Cold-Fermented Matcha Oat Latte', titleSize: 'lg' },
                { id: `b-${now}-4`, type: 'body', bodyText: 'มัทฉะเกรดพิธีการสกัดเย็น 24 ชม. กลมกล่อมเข้ากับโอ๊ตมิลค์อย่างลงตัว สั่งล่วงหน้าได้แล้ววันนี้' },
                { id: `b-${now}-5`, type: 'highlight', highlightText: '✨ ราคาพิเศษ 65.- (ปกติ 75.-)' },
                { id: `b-${now}-6`, type: 'button', buttonLabel: '🍵 สั่งเครื่องดื่มทันที', buttonUrl: 'https://homematchacafe.store/menu', buttonStyle: 'primary' },
                { id: `b-${now}-7`, type: 'button', buttonLabel: '⭐ ตรวจสอบแต้มสะสม', buttonUrl: 'https://homematchacafe.store/loyalty', buttonStyle: 'outline' }
            ];
        } else if (preset === 'loyalty') {
            designerCardBlocks = [
                { id: `b-${now}-1`, type: 'banner', imageUrl: 'https://homematchacafe.store/image/mascot/cat-loyalty.jpg', aspectRatio: '1:1' },
                { id: `b-${now}-2`, type: 'tag', tagText: '🎉 สะสมแต้ม Home Matcha Cafe', tagBg: '#fef3c7', tagColor: '#92400e' },
                { id: `b-${now}-3`, type: 'title', titleText: 'สะสมครบ 10 แต้ม แลกรับฟรี 1 แก้ว!', titleSize: 'xl' },
                { id: `b-${now}-4`, type: 'body', bodyText: 'ทุกๆ การสั่งซื้อ 1 แก้ว รับทันที 1 สแตมป์ เมื่อสะสมครบ 10 สแตมป์ สามารถกดแลกเครื่องดื่มเมนูโปรดของคุณได้ฟรีทันทีค่ะ' },
                { id: `b-${now}-5`, type: 'highlight', highlightText: '⭐ ตรวจสอบแต้มสะสมได้ง่ายๆ เพียงพิมพ์ "แต้ม" หรือกดปุ่มด้านล่าง' },
                { id: `b-${now}-6`, type: 'button', buttonLabel: '📱 เปิดบัตรสะสมแต้มของฉัน', buttonUrl: 'https://homematchacafe.store/loyalty', buttonStyle: 'gold' },
                { id: `b-${now}-7`, type: 'button', buttonLabel: '🍵 สั่งเครื่องดื่มเพื่อสะสมแต้ม', buttonUrl: 'https://homematchacafe.store/menu', buttonStyle: 'primary' }
            ];
        } else if (preset === 'delivery') {
            designerCardBlocks = [
                { id: `b-${now}-1`, type: 'banner', imageUrl: 'https://homematchacafe.store/image/mascot/cat-delivery.jpg', aspectRatio: '1:1' },
                { id: `b-${now}-2`, type: 'tag', tagText: '🛵 บริการจัดส่งถึงตึกและแผนก', tagBg: '#e0f2fe', tagColor: '#0369a1' },
                { id: `b-${now}-3`, type: 'title', titleText: 'รอบจัดส่งร้าน Home Matcha Cafe', titleSize: 'lg' },
                { id: `b-${now}-4`, type: 'body', bodyText: 'บริการส่งฟรีถึงตึกผู้ป่วย แผนก และบ้านพักในโรงพยาบาล:\n• รอบเช้า: 07:00–08:00 น.\n• รอบเที่ยง: 12:30–13:00 น.\n• วันหยุด/เสาร์-อาทิตย์: รอบสาย–บ่าย (09:00–13:00 น.)' },
                { id: `b-${now}-5`, type: 'highlight', highlightText: '⏰ สามารถเลือกเวลานัดส่งที่สะดวกรับได้ตอนสั่งซื้อนะคะ' },
                { id: `b-${now}-6`, type: 'button', buttonLabel: '🍵 สั่งเครื่องดื่มรอบถัดไป', buttonUrl: 'https://homematchacafe.store/menu', buttonStyle: 'primary' },
                { id: `b-${now}-7`, type: 'button', buttonLabel: '🔍 ตรวจสอบสถานะออเดอร์', buttonUrl: 'https://homematchacafe.store/order', buttonStyle: 'outline' }
            ];
        }
    }

    function buildDesignerFlexBubble() {
        const banner = designerCardBlocks.find(b => b.type === 'banner');
        const hero = banner && banner.imageUrl ? {
            type: 'image',
            url: banner.imageUrl,
            size: banner.imageSize || 'full',
            aspectRatio: banner.aspectRatio || '20:13',
            aspectMode: banner.aspectMode || 'cover',
            backgroundColor: '#f8fafc'
        } : undefined;

        const bodyContents: any[] = [];
        const footerContents: any[] = [];

        for (const b of designerCardBlocks) {
            if (b.type === 'tag' && b.tagText) {
                bodyContents.push({
                    type: 'box',
                    layout: 'horizontal',
                    contents: [
                        {
                            type: 'text',
                            text: b.tagText,
                            size: 'xs',
                            weight: 'bold',
                            color: b.tagColor || '#166534',
                            flex: 0
                        }
                    ],
                    backgroundColor: b.tagBg || '#dcfce7',
                    paddingAll: '4px',
                    paddingStart: '8px',
                    paddingEnd: '8px',
                    cornerRadius: '999px',
                    margin: bodyContents.length > 0 ? 'md' : 'none'
                });
            } else if (b.type === 'title' && b.titleText) {
                bodyContents.push({
                    type: 'text',
                    text: b.titleText,
                    weight: 'bold',
                    size: b.titleSize === 'xl' ? 'xl' : b.titleSize === 'md' ? 'md' : 'lg',
                    color: '#14532d',
                    wrap: true,
                    margin: bodyContents.length > 0 ? 'md' : 'none'
                });
            } else if (b.type === 'body' && b.bodyText) {
                bodyContents.push({
                    type: 'text',
                    text: b.bodyText,
                    size: 'sm',
                    color: '#475569',
                    wrap: true,
                    lineSpacing: '4px',
                    margin: bodyContents.length > 0 ? 'sm' : 'none'
                });
            } else if (b.type === 'highlight' && b.highlightText) {
                bodyContents.push({
                    type: 'box',
                    layout: 'vertical',
                    backgroundColor: '#fef3c7',
                    borderWidth: '1.5px',
                    borderColor: '#fde047',
                    cornerRadius: '8px',
                    paddingAll: '8px',
                    margin: 'md',
                    contents: [
                        {
                            type: 'text',
                            text: b.highlightText,
                            size: 'sm',
                            weight: 'bold',
                            color: '#92400e',
                            wrap: true
                        }
                    ]
                });
            } else if (b.type === 'button' && b.buttonLabel) {
                const btnColor = b.buttonStyle === 'gold' ? '#d97706' : b.buttonStyle === 'secondary' ? '#475569' : '#166534';
                const isOutline = b.buttonStyle === 'outline';
                footerContents.push({
                    type: 'button',
                    style: isOutline ? 'secondary' : 'primary',
                    color: isOutline ? undefined : btnColor,
                    height: 'sm',
                    action: {
                        type: 'uri',
                        label: b.buttonLabel.slice(0, 40),
                        uri: b.buttonUrl || 'https://homematchacafe.store/menu'
                    }
                });
            }
        }

        const bubble: any = {
            type: 'bubble',
            size: 'mega',
            body: {
                type: 'box',
                layout: 'vertical',
                paddingAll: '20px',
                contents: bodyContents.length > 0 ? bodyContents : [
                    { type: 'text', text: 'Home Matcha Cafe', weight: 'bold', size: 'md', color: '#166534' }
                ]
            }
        };

        if (hero) bubble.hero = hero;
        if (footerContents.length > 0) {
            bubble.footer = {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                paddingAll: '16px',
                contents: footerContents
            };
        }

        return bubble;
    }

    async function sendDesignerCard() {
        if (!settings.lineOa.channelAccessToken) {
            swal.fire('ยังไม่มี Token', 'กรุณาระบุ Channel Access Token ในการตั้งค่า LINE OA ก่อนนะคะ', 'warning');
            return;
        }

        const targetLabel = designerTarget === 'admin' ? 'LINE ของแอดมิน' : 'ลูกค้าทุกคน (บรอดแคสต์)';
        const confirmResult = await swal.fire({
            icon: 'question',
            title: `ยืนยันส่งการ์ดไปยัง ${targetLabel}?`,
            text: designerTarget === 'broadcast'
                ? 'ระบบจะส่งการ์ดนี้เป็นข้อความบรอดแคสต์หาเพื่อนทุกคนใน LINE OA ทันทีค่ะ'
                : 'ระบบจะส่งการ์ดทดสอบไปยัง LINE ID ของแอดมิน เพื่อให้ตรวจดูความสวยงามในแอป LINE จริงค่ะ',
            showCancelButton: true,
            confirmButtonColor: '#166534',
            confirmButtonText: '✓ ยืนยันส่ง',
            cancelButtonText: 'ยกเลิก'
        });

        if (!confirmResult.isConfirmed) return;

        isSendingDesignerCard = true;
        try {
            const flexBubble = buildDesignerFlexBubble();
            const res = await fetch('/api/line/send-card', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    target: designerTarget,
                    flexBubble,
                    altText: designerAltText,
                    testVars
                })
            });

            const data = await res.json();
            if (data.success) {
                swal.fire({
                    icon: 'success',
                    title: 'ส่งการ์ดสำเร็จ! 💬',
                    text: data.message,
                    confirmButtonColor: '#166534'
                });
            } else {
                swal.fire({
                    icon: 'error',
                    title: 'ส่งไม่สำเร็จ',
                    text: data.message || 'โปรดตรวจสอบ Channel Access Token อีกครั้งค่ะ',
                    confirmButtonColor: '#dc2626'
                });
            }
        } catch (e: any) {
            swal.fire('ข้อผิดพลาด', e?.message || 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', 'error');
        } finally {
            isSendingDesignerCard = false;
        }
    }

    function copyDesignerFlexJson() {
        const bubble = buildDesignerFlexBubble();
        navigator.clipboard.writeText(JSON.stringify(bubble, null, 2));
        swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: 'คัดลอก LINE Flex JSON เรียบร้อย! 📋',
            showConfirmButton: false,
            timer: 2000
        });
    }

    async function setAsWelcomeCard() {
        const bubble = buildDesignerFlexBubble();
        settings.lineOa.useCustomWelcomeCard = true;
        settings.lineOa.welcomeCardBubble = bubble;
        settings.lineOa.welcomeCardBlocks = JSON.parse(JSON.stringify(designerCardBlocks));

        await saveAllSettings();
        swal.fire({
            icon: 'success',
            title: 'ตั้งเป็นการ์ดต้อนรับสำเร็จ! 🎉',
            text: 'เมื่อมีลูกค้ากดเพิ่มเพื่อน (Follow) LINE OA ครั้งแรก ระบบจะส่งการ์ดนี้ให้ลูกค้าทันทีค่ะ 🍵',
            confirmButtonColor: '#166534'
        });
    }

    async function unsetWelcomeCard() {
        settings.lineOa.useCustomWelcomeCard = false;
        await saveAllSettings();
        swal.fire({
            icon: 'info',
            title: 'เปลี่ยนกลับเป็นข้อความต้อนรับปกติแล้วค่ะ',
            text: 'ระบบจะส่งข้อความตัวหนังสือแบบเดิมเมื่อมีลูกค้าเพิ่มเพื่อน',
            confirmButtonColor: '#166534'
        });
    }

    async function setAsMemberCard() {
        const bubble = buildDesignerFlexBubble();
        settings.lineOa.useCustomMemberCard = true;
        settings.lineOa.memberCardBubble = bubble;
        settings.lineOa.memberCardBlocks = JSON.parse(JSON.stringify(designerCardBlocks));

        await saveAllSettings();
        swal.fire({
            icon: 'success',
            title: 'ตั้งเป็นการ์ดแจ้งเตือนสมาชิกเดิมสำเร็จ! 🎉',
            text: 'เมื่อลูกค้าพิมพ์เบอร์ที่พบว่ามีในระบบแล้ว ระบบจะส่งการ์ดนี้ให้ลูกค้าทันทีค่ะ 🍵',
            confirmButtonColor: '#166534'
        });
    }

    async function unsetMemberCard() {
        settings.lineOa.useCustomMemberCard = false;
        await saveAllSettings();
        swal.fire({
            icon: 'info',
            title: 'เปลี่ยนกลับเป็นการ์ดสมาชิกมาตรฐานแล้วค่ะ',
            text: 'ระบบจะส่งการ์ดสมาชิกเริ่มต้นเมื่อตรวจพบข้อมูลสมาชิกในระบบ',
            confirmButtonColor: '#166534'
        });
    }

    function loadSavedMemberCard() {
        if (Array.isArray(settings.lineOa.memberCardBlocks) && settings.lineOa.memberCardBlocks.length > 0) {
            designerCardBlocks = JSON.parse(JSON.stringify(settings.lineOa.memberCardBlocks));
            swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'โหลดการ์ดสมาชิกเดิมที่บันทึกไว้แล้ว 🍵', showConfirmButton: false, timer: 1500 });
        } else {
            loadDesignerPreset('member');
        }
    }

    async function setAsRegisterCard() {
        const bubble = buildDesignerFlexBubble();
        settings.lineOa.useCustomRegisterCard = true;
        settings.lineOa.registerCardBubble = bubble;
        settings.lineOa.registerCardBlocks = JSON.parse(JSON.stringify(designerCardBlocks));

        await saveAllSettings();
        swal.fire({
            icon: 'success',
            title: 'ตั้งเป็นการ์ดชวนสมัครสมาชิกสำเร็จ! 🎉',
            text: 'เมื่อลูกค้าพิมพ์เบอร์ 10 หลักที่ยังไม่ได้สมัครสมาชิก ระบบจะส่งการ์ดนี้พร้อมนำเบอร์ไปกรอกให้อัตโนมัติทันทีค่ะ 🍵',
            confirmButtonColor: '#be185d'
        });
    }

    async function unsetRegisterCard() {
        settings.lineOa.useCustomRegisterCard = false;
        await saveAllSettings();
        swal.fire({
            icon: 'info',
            title: 'เปลี่ยนกลับเป็นการ์ดสมัครสมาชิกมาตรฐานแล้วค่ะ',
            text: 'ระบบจะส่งการ์ดสมัครสมาชิกแบบเริ่มต้นเมื่อลูกค้าพิมพ์เบอร์โทรใหม่',
            confirmButtonColor: '#166534'
        });
    }

    function loadSavedWelcomeCard() {
        if (Array.isArray(settings.lineOa.welcomeCardBlocks) && settings.lineOa.welcomeCardBlocks.length > 0) {
            designerCardBlocks = JSON.parse(JSON.stringify(settings.lineOa.welcomeCardBlocks));
            swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'โหลดการ์ดต้อนรับที่บันทึกไว้แล้ว 🍵', showConfirmButton: false, timer: 1500 });
        } else {
            loadDesignerPreset('welcome');
        }
    }

    function loadSavedRegisterCard() {
        if (Array.isArray(settings.lineOa.registerCardBlocks) && settings.lineOa.registerCardBlocks.length > 0) {
            designerCardBlocks = JSON.parse(JSON.stringify(settings.lineOa.registerCardBlocks));
            swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'โหลดการ์ดสมัครสมาชิกที่บันทึกไว้แล้ว ✨', showConfirmButton: false, timer: 1500 });
        } else {
            loadDesignerPreset('register');
        }
    }

    async function setAsStatusCard(statusKey: 'order_created' | 'slip_approved' | 'brewing' | 'ready_to_ship' | 'delivering' | 'completed' | 'cancelled' | 'member_registered') {
        const bubble = buildDesignerFlexBubble();
        if (!settings.lineOa.customStatusCards) {
            settings.lineOa.customStatusCards = {};
        }
        settings.lineOa.customStatusCards[statusKey] = {
            enabled: true,
            bubble: bubble,
            blocks: JSON.parse(JSON.stringify(designerCardBlocks))
        };
        await saveAllSettings();
        const statusNameMap: Record<string, string> = {
            order_created: '📝 รับออเดอร์ใหม่ (Order Created)',
            member_registered: '🎉 ลูกค้าสมัครสมาชิกเสร็จแล้ว',
            slip_approved: '💳 อนุมัติสลิป / รับยอด',
            brewing: '🍵 กำลังชง',
            ready_to_ship: '✨ ชงเสร็จพร้อมส่ง',
            delivering: '🛵 กำลังนำส่ง',
            completed: '🎉 จัดส่งสำเร็จ',
            cancelled: '❌ ยกเลิกออเดอร์'
        };
        swal.fire({
            icon: 'success',
            title: `ตั้งเป็นการ์ดแจ้งเตือน "${statusNameMap[statusKey]}" สำเร็จ! 🎉`,
            text: `เมื่อออเดอร์ของลูกค้าเปลี่ยนเป็นสถานะนี้ บอท LINE จะส่งการ์ดที่คุณออกแบบนี้ให้ลูกค้าทันทีค่ะ 🍵`,
            confirmButtonColor: '#166534'
        });
    }

    async function unsetStatusCard(statusKey: string) {
        if (settings.lineOa.customStatusCards?.[statusKey]) {
            settings.lineOa.customStatusCards[statusKey].enabled = false;
            await saveAllSettings();
            swal.fire({
                icon: 'info',
                title: 'สลับกลับเป็นการ์ดมาตรฐานของระบบแล้วค่ะ',
                text: 'ระบบจะส่งการ์ดมาสคอตมาตรฐานเมื่อออเดอร์มีสถานะนี้',
                confirmButtonColor: '#166534'
            });
        }
    }

    function loadSavedStatusCard(statusKey: string) {
        const cfg = settings.lineOa.customStatusCards?.[statusKey];
        if (cfg?.blocks && Array.isArray(cfg.blocks) && cfg.blocks.length > 0) {
            designerCardBlocks = JSON.parse(JSON.stringify(cfg.blocks));
            swal.fire({ toast: true, position: 'top-end', icon: 'success', title: `โหลดการ์ดสถานะที่บันทึกไว้แล้ว ✨`, showConfirmButton: false, timer: 1500 });
        } else {
            const presetMap: Record<string, any> = {
                order_created: 'status_order_created',
                member_registered: 'status_member_registered',
                slip_approved: 'status_slip_approved',
                brewing: 'status_brewing',
                ready_to_ship: 'status_ready',
                delivering: 'status_delivering',
                completed: 'status_completed',
                cancelled: 'status_cancelled'
            };
            loadDesignerPreset(presetMap[statusKey] || 'status_brewing');
        }
    }

    function copyToClipboard(text: string, title: string = 'คัดลอกสำเร็จแล้ว 📋') {
        if (!text) return;
        navigator.clipboard.writeText(text);
        swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title,
            showConfirmButton: false,
            timer: 1500
        });
    }

    function insertVariableToBlock(block: any, field: string, variable: string) {
        if (!block) return;
        if (!block[field]) {
            block[field] = variable;
        } else {
            block[field] = `${block[field]} ${variable}`;
        }
    }

    function insertVariableToPhoneEvent(eventKey: 'existing' | 'new', variable: string) {
        if (eventKey === 'existing') {
            settings.lineOa.phoneLinkedExistingMessage = (settings.lineOa.phoneLinkedExistingMessage || '') + (settings.lineOa.phoneLinkedExistingMessage ? ' ' : '') + variable;
        } else {
            settings.lineOa.phoneLinkedNewMessage = (settings.lineOa.phoneLinkedNewMessage || '') + (settings.lineOa.phoneLinkedNewMessage ? ' ' : '') + variable;
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

    async function cycleDayRounds(dateStr: string) {
        const current = settings.calendar[dateStr] || { isOpen: false };
        const dParts = dateStr.split('-').map(Number);
        const dayOfWeek = new Date(dParts[0], dParts[1] - 1, dParts[2]).getDay();
        const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
        const hasAllDayConfig = settings.deliveryRounds.some(r => r.id === 'allday' || r.isAllDayOpen);

        let nextIsOpen = true;
        let nextCustomRounds: string[] = [];

        if (!current.isOpen) {
            // ปิดอยู่ -> เปิดทั้ง 2 รอบ (หรือ allday ในวันหยุด)
            nextIsOpen = true;
            nextCustomRounds = (isWeekend && hasAllDayConfig) ? ['allday'] : ['morning', 'noon'];
        } else {
            const rounds = current.customRounds && current.customRounds.length > 0 ? current.customRounds : ['morning', 'noon'];
            if (rounds.includes('allday')) {
                // รวบสาย-บ่าย -> ปิด
                nextIsOpen = false;
                nextCustomRounds = [];
            } else if (rounds.includes('morning') && rounds.includes('noon')) {
                // เปิดทั้งเช้า+บ่าย -> แค่รอบเช้า
                nextIsOpen = true;
                nextCustomRounds = ['morning'];
            } else if (rounds.length === 1 && rounds.includes('morning')) {
                // แค่รอบเช้า -> แค่รอบบ่าย
                nextIsOpen = true;
                nextCustomRounds = ['noon'];
            } else {
                // แค่รอบบ่าย หรือโหมดอื่นๆ -> ปิด
                nextIsOpen = false;
                nextCustomRounds = [];
            }
        }

        settings.calendar[dateStr] = {
            isOpen: nextIsOpen,
            customRounds: nextCustomRounds
        };

        // บันทึกลงระบบทันที
        try {
            await fetch('/api/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
        } catch (e) {
            console.error('Auto-save day cycle failed:', e);
        }
    }

    function toggleDayOpen(dateStr: string) {
        cycleDayRounds(dateStr);
    }

    function setDayModalPreset(preset: 'both' | 'morning' | 'noon' | 'allday' | 'closed') {
        if (!editingDayModal) return;
        if (preset === 'closed') {
            editingDayModal.isOpen = false;
            editingDayModal.customRounds = [];
        } else if (preset === 'both') {
            editingDayModal.isOpen = true;
            editingDayModal.customRounds = ['morning', 'noon'];
        } else if (preset === 'morning') {
            editingDayModal.isOpen = true;
            editingDayModal.customRounds = ['morning'];
        } else if (preset === 'noon') {
            editingDayModal.isOpen = true;
            editingDayModal.customRounds = ['noon'];
        } else if (preset === 'allday') {
            editingDayModal.isOpen = true;
            editingDayModal.customRounds = ['allday'];
        }
    }

    function openEditDayModal(dateStr: string) {
        const dParts = dateStr.split('-').map(Number);
        const dayOfWeek = new Date(dParts[0], dParts[1] - 1, dParts[2]).getDay();
        const defaultRounds = (dayOfWeek === 0 || dayOfWeek === 6) ? ['allday'] : ['morning', 'noon'];
        const current = settings.calendar[dateStr] || { isOpen: false, customRounds: defaultRounds };
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

            <!-- ⚡ ปุ่มลัดเลือกโหมดรอบส่งแบบ 1-Click -->
            <div style="margin: 0.85rem 0 0.75rem 0;">
                <span style="font-size: 0.82rem; font-weight: 700; color: #475569; display: block; margin-bottom: 0.4rem;">
                    ⚡ เลือกโหมดรอบส่งด่วน:
                </span>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                    <button
                        type="button"
                        onclick={() => setDayModalPreset('both')}
                        style="padding: 0.6rem 0.5rem; font-size: 0.85rem; border-radius: 12px; font-weight: 700; cursor: pointer; transition: all 0.15s; border: 2px solid {editingDayModal.isOpen && editingDayModal.customRounds.includes('morning') && editingDayModal.customRounds.includes('noon') ? '#22c55e' : '#e2e8f0'}; background: {editingDayModal.isOpen && editingDayModal.customRounds.includes('morning') && editingDayModal.customRounds.includes('noon') ? '#f0fdf4' : '#ffffff'}; color: #166534; display: flex; flex-direction: column; align-items: center; gap: 2px;"
                    >
                        <span>🌅☀️ เช้า + บ่าย</span>
                        <span style="font-size: 0.72rem; font-weight: 500; color: #166534;">(เปิดทั้ง 2 รอบ)</span>
                    </button>
                    <button
                        type="button"
                        onclick={() => setDayModalPreset('morning')}
                        style="padding: 0.6rem 0.5rem; font-size: 0.85rem; border-radius: 12px; font-weight: 700; cursor: pointer; transition: all 0.15s; border: 2px solid {editingDayModal.isOpen && editingDayModal.customRounds.length === 1 && editingDayModal.customRounds.includes('morning') ? '#3b82f6' : '#e2e8f0'}; background: {editingDayModal.isOpen && editingDayModal.customRounds.length === 1 && editingDayModal.customRounds.includes('morning') ? '#eff6ff' : '#ffffff'}; color: #1d4ed8; display: flex; flex-direction: column; align-items: center; gap: 2px;"
                    >
                        <span>🌅 แค่รอบเช้า</span>
                        <span style="font-size: 0.72rem; font-weight: 500; color: #1d4ed8;">(7:00 - 8:30 น.)</span>
                    </button>
                    <button
                        type="button"
                        onclick={() => setDayModalPreset('noon')}
                        style="padding: 0.6rem 0.5rem; font-size: 0.85rem; border-radius: 12px; font-weight: 700; cursor: pointer; transition: all 0.15s; border: 2px solid {editingDayModal.isOpen && editingDayModal.customRounds.length === 1 && editingDayModal.customRounds.includes('noon') ? '#f59e0b' : '#e2e8f0'}; background: {editingDayModal.isOpen && editingDayModal.customRounds.length === 1 && editingDayModal.customRounds.includes('noon') ? '#fffbeb' : '#ffffff'}; color: #b45309; display: flex; flex-direction: column; align-items: center; gap: 2px;"
                    >
                        <span>☀️ แค่รอบบ่าย</span>
                        <span style="font-size: 0.72rem; font-weight: 500; color: #b45309;">(12:30 น.)</span>
                    </button>
                    <button
                        type="button"
                        onclick={() => setDayModalPreset('closed')}
                        style="padding: 0.6rem 0.5rem; font-size: 0.85rem; border-radius: 12px; font-weight: 700; cursor: pointer; transition: all 0.15s; border: 2px solid {!editingDayModal.isOpen ? '#ef4444' : '#e2e8f0'}; background: {!editingDayModal.isOpen ? '#fef2f2' : '#ffffff'}; color: #991b1b; display: flex; flex-direction: column; align-items: center; gap: 2px;"
                    >
                        <span>⚪ ปิดร้านทั้งวัน</span>
                        <span style="font-size: 0.72rem; font-weight: 500; color: #991b1b;">(ไม่รับออเดอร์)</span>
                    </button>
                    {#if settings.deliveryRounds.some(r => r.id === 'allday' || r.isAllDayOpen)}
                        <button
                            type="button"
                            onclick={() => setDayModalPreset('allday')}
                            style="grid-column: span 2; padding: 0.6rem 0.5rem; font-size: 0.85rem; border-radius: 12px; font-weight: 700; cursor: pointer; transition: all 0.15s; border: 2px solid {editingDayModal.isOpen && editingDayModal.customRounds.includes('allday') ? '#8b5cf6' : '#e2e8f0'}; background: {editingDayModal.isOpen && editingDayModal.customRounds.includes('allday') ? '#f5f3ff' : '#ffffff'}; color: #5b21b6; display: flex; flex-direction: column; align-items: center; gap: 2px;"
                        >
                            <span>🌿 รอบพิเศษ รวบสาย-บ่าย</span>
                            <span style="font-size: 0.72rem; font-weight: 500; color: #5b21b6;">(9:00 - 13:00 น. สำหรับวันหยุด)</span>
                        </button>
                    {/if}
                </div>
            </div>
            
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

<!-- Modal เพิ่ม/แก้ไขคีย์เวิร์ดตอบกลับ LINE OA -->
{#if editingKeywordModal}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div 
        style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.65); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 99999; padding: 1rem;"
        onclick={() => (editingKeywordModal = null)}
    >
        <div 
            style="background: #ffffff; border-radius: 20px; max-width: 500px; width: 100%; padding: 1.5rem; text-align: left; box-shadow: 0 20px 50px rgba(0,0,0,0.25); max-height: 90vh; overflow-y: auto;"
            onclick={(e) => e.stopPropagation()}
        >
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <h3 style="margin: 0; font-size: 1.15rem; color: #166534; font-weight: 800;">
                    {editingKeywordModal.isNew ? '➕ เพิ่มคีย์เวิร์ดตอบกลับใหม่' : '✏️ แก้ไขคีย์เวิร์ดตอบกลับ'}
                </h3>
                <button 
                    type="button" 
                    onclick={() => (editingKeywordModal = null)}
                    style="border: none; background: #f1f5f9; border-radius: 50%; width: 32px; height: 32px; font-weight: bold; cursor: pointer; color: #64748b;"
                >
                    ✕
                </button>
            </div>

            <div style="display: flex; flex-direction: column; gap: 0.85rem;">
                <div>
                    <label for="kwKeyword" style="display: block; font-size: 0.82rem; font-weight: 700; color: #334155; margin-bottom: 0.3rem;">
                        คำค้นหา / คีย์เวิร์ดที่ลูกค้าพิมพ์:
                    </label>
                    <input
                        id="kwKeyword"
                        type="text"
                        bind:value={editingKeywordModal.keyword}
                        placeholder="เช่น เมนู, เวลาส่ง, เบอร์โทร, สั่งซื้อ"
                        style="width: 100%; padding: 0.55rem 0.75rem; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 0.88rem;"
                    />
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                    <div>
                        <label for="kwMatchType" style="display: block; font-size: 0.82rem; font-weight: 700; color: #334155; margin-bottom: 0.3rem;">
                            เงื่อนไขการจับคู่:
                        </label>
                        <select
                            id="kwMatchType"
                            bind:value={editingKeywordModal.matchType}
                            style="width: 100%; padding: 0.55rem 0.75rem; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 0.85rem;"
                        >
                            <option value="contains">มีคำนี้อยู่ในข้อความ (แนะนำ)</option>
                            <option value="exact">ตรงกันทุกตัวอักษรเป๊ะๆ</option>
                        </select>
                    </div>

                    <div>
                        <label for="kwReplyType" style="display: block; font-size: 0.82rem; font-weight: 700; color: #334155; margin-bottom: 0.3rem;">
                            ประเภทการตอบกลับ:
                        </label>
                        <select
                            id="kwReplyType"
                            bind:value={editingKeywordModal.replyType}
                            style="width: 100%; padding: 0.55rem 0.75rem; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 0.85rem;"
                        >
                            <option value="text">ข้อความตัวอักษร</option>
                            <option value="flex_menu">การ์ด Flex เมนูมัทฉะ</option>
                            <option value="flex_status">การ์ด Flex ติดตามสถานะ</option>
                            <option value="flex_loyalty">การ์ด Flex บัตรสะสมแต้ม</option>
                        </select>
                    </div>
                </div>

                {#if editingKeywordModal.replyType === 'text'}
                    <div>
                        <label for="kwReplyText" style="display: block; font-size: 0.82rem; font-weight: 700; color: #334155; margin-bottom: 0.3rem;">
                            ข้อความตอบกลับ:
                        </label>
                        <textarea
                            id="kwReplyText"
                            bind:value={editingKeywordModal.replyText}
                            rows={4}
                            placeholder="พิมพ์ข้อความที่ต้องการให้บอทตอบกลับลูกค้าอัตโนมัติ..."
                            style="width: 100%; padding: 0.55rem 0.75rem; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 0.85rem; line-height: 1.5;"
                        ></textarea>
                    </div>
                {:else}
                    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 0.75rem; font-size: 0.82rem; color: #166534;">
                        ✨ บอทจะตอบกลับด้วยการ์ด <strong>Flex Message</strong> ดีไซน์พิเศษของ Home Matcha Cafe พร้อมปุ่มกดเข้าสู่เว็บไซต์โดยอัตโนมัติ
                    </div>
                {/if}

                <div>
                    <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                        <input
                            type="checkbox"
                            bind:checked={editingKeywordModal.enabled}
                            style="width: 18px; height: 18px; accent-color: #166534;"
                        />
                        <span style="font-size: 0.88rem; font-weight: 700; color: #1e293b;">
                            เปิดใช้งานคีย์เวิร์ดนี้ทันที
                        </span>
                    </label>
                </div>
            </div>

            <div style="display: flex; gap: 0.5rem; margin-top: 1.25rem;">
                <button
                    type="button"
                    onclick={saveKeywordModal}
                    class="btn-matcha-primary"
                    style="flex: 1; padding: 0.7rem; font-weight: 800;"
                >
                    💾 บันทึกคีย์เวิร์ด
                </button>
                <button
                    type="button"
                    onclick={() => (editingKeywordModal = null)}
                    class="btn-matcha-outline"
                    style="padding: 0.7rem 1.2rem;"
                >
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
<main class="menu-page-wrapper admin-page-shell" style="max-width: 1100px; margin: 0 auto; width: 100%; padding-bottom: 5rem;">
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
            <a href="/" class="btn-matcha-outline admin-btn-to-shop" style="padding: 0.5rem 0.85rem; font-size: 0.82rem; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem; font-weight: 700;">
                🏠 ดูหน้าร้านค้า
            </a>
            <button onclick={openCreateOrderModal} class="btn-matcha-primary" style="padding: 0.5rem 0.95rem; font-size: 0.85rem; font-weight: 800; background: #15803d; border-color: #15803d; display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem;">
                ➕ เพิ่มออเดอร์
            </button>
            <button onclick={() => { loadOrders(); loadMembers(); loadMenus(); }} class="btn-matcha-outline" style="padding: 0.5rem 0.85rem; font-size: 0.85rem; display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem;">
                🔄 รีเฟรช
            </button>
            <button onclick={handleLockAdmin} class="btn-danger" style="padding: 0.5rem 0.85rem; font-size: 0.82rem; display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem;">
                🔒 ล็อก
            </button>
        </div>
    </div>

    <!-- แถบสลับแท็บหลัก 6 แท็บ -->
    <div class="admin-main-tabs">
        <button 
            type="button"
            onclick={() => (activeTab = 'orders')}
            class="admin-main-tab-btn {activeTab === 'orders' ? 'active' : ''}"
        >
            <span>🍵 คิวงานปัจจุบัน</span>
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
            onclick={() => (activeTab = 'delivery')}
            class="admin-main-tab-btn {activeTab === 'delivery' ? 'active' : ''}"
        >
            <span>🛵 ตัวช่วยจัดส่ง</span>
            {#if pendingDeliveryOrders.length > 0}
                <span style="background: #0284c7; color: #fff; font-size: 0.72rem; padding: 0.08rem 0.45rem; border-radius: 999px;">
                    {pendingDeliveryOrders.length}
                </span>
            {/if}
        </button>

        <button 
            type="button"
            onclick={() => (activeTab = 'history')}
            class="admin-main-tab-btn {activeTab === 'history' ? 'active' : ''}"
        >
            <span>📜 ประวัติคำสั่งซื้อ</span>
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
            onclick={() => { activeTab = 'line_oa'; loadLineUsers(); }}
            class="admin-main-tab-btn {activeTab === 'line_oa' ? 'active' : ''}"
        >
            <span>💬 LINE OA</span>
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
                        onclick={() => (manualReviewOrders.length > 0 ? openSlipReviewModal(manualReviewOrders[0]) : (selectedFilter = 'pending'))}
                        style="background: #d97706; color: #fff; border: none; border-radius: 999px; padding: 0.55rem 1.25rem; font-weight: 800; font-size: 0.85rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem; box-shadow: 0 4px 12px rgba(217, 119, 6, 0.35);"
                    >
                        🔍 ตรวจคำขออนุมัติ ({manualReviewOrders.length})
                    </button>
                </div>
            </div>
        {/if}

        <!-- สรุปสถิติคิวปัจจุบัน 4 ช่อง -->
        <div class="admin-stats-grid">
            <div class="form-card admin-stat-card">
                <p style="margin: 0; font-size: 0.78rem; color: var(--text-muted);">💰 ยอดขายในคิววันนี้</p>
                <h2 class="admin-stat-value" style="color: var(--matcha-dark);">
                    {Number(liveTotalSales.toFixed(2))} <span style="font-size: 0.9rem; font-weight: 500;">บาท</span>
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
                <p style="margin: 0; font-size: 0.78rem; color: var(--text-muted);">✅ จัดส่งสำเร็จแล้ววันนี้</p>
                <h2 class="admin-stat-value" style="color: var(--green-status);">
                    {todayCompletedCount} <span style="font-size: 0.9rem; font-weight: 500;">ออเดอร์</span>
                </h2>
            </div>
        </div>

        <!-- แถบเครื่องมือจัดการคิวและปุ่มสร้างออเดอร์ -->
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 0.9rem;">
            <div style="font-size: 0.95rem; font-weight: 800; color: #1e293b; display: flex; align-items: center; gap: 0.4rem;">
                📋 กระดานคิวชงและคำสั่งซื้อ (เฉพาะคิวปัจจุบัน)
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                <button 
                    type="button"
                    onclick={() => {
                        isBrewSummaryExpanded = !isBrewSummaryExpanded;
                        if (isBrewSummaryExpanded) {
                            selectedFilter = 'to_brew';
                        }
                    }} 
                    class="btn-matcha-primary" 
                    style="padding: 0.45rem 1.15rem; font-size: 0.85rem; font-weight: 800; background: {isBrewSummaryExpanded ? '#15803d' : '#047857'}; box-shadow: 0 3px 10px rgba(4, 120, 87, 0.25); display: inline-flex; align-items: center; gap: 0.4rem;"
                    title="คลิกเพื่อยุบหรือขยายการ์ดสรุปคิวชงเครื่องดื่ม"
                >
                    🍵 สรุปคิวชง ({filteredTotalCups} แก้ว) {isBrewSummaryExpanded ? '▲' : '▼'}
                </button>
                <button 
                    type="button"
                    onclick={openCreateOrderModal} 
                    class="btn-matcha-primary" 
                    style="padding: 0.45rem 1.15rem; font-size: 0.85rem; font-weight: 800; background: #166534; box-shadow: 0 3px 10px rgba(22, 101, 52, 0.25); display: inline-flex; align-items: center; gap: 0.35rem;"
                >
                    ➕ เพิ่มออเดอร์ / แก้วเข้าคิว
                </button>
            </div>
        </div>

        <!-- แถบตัวกรองสถานะ (เฉพาะคิวปัจจุบัน) -->
        <div class="category-filter-bar" style="margin-bottom: 1.25rem; width: 100%;">
            <button class="category-tab-btn {selectedFilter === 'all' ? 'active' : ''}" onclick={() => { selectedFilter = 'all'; selectedOrderIds = []; }}>
                ทั้งหมดในคิว ({liveOrders.length})
            </button>
            <button 
                class="category-tab-btn {selectedFilter === 'to_brew' ? 'active' : ''}" 
                onclick={() => { selectedFilter = 'to_brew'; selectedOrderIds = []; }}
                style="background: {selectedFilter === 'to_brew' ? '#047857' : '#ecfdf5'}; color: {selectedFilter === 'to_brew' ? '#ffffff' : '#065f46'}; font-weight: 800; border: 1.5px solid {selectedFilter === 'to_brew' ? '#047857' : '#a7f3d0'};"
            >
                🍵 คิวที่ต้องชง ({toBrewCount})
            </button>
            <button 
                class="category-tab-btn {selectedFilter === 'pending' ? 'active' : ''}" 
                onclick={() => { selectedFilter = 'pending'; selectedOrderIds = []; }}
                style="{manualReviewOrders.length > 0 && selectedFilter !== 'pending' ? 'border-color: #f59e0b; color: #b45309; font-weight: 700;' : ''}"
            >
                🔔 รอตรวจสลิป ({manualReviewOrders.length})
            </button>
            <button class="category-tab-btn {selectedFilter === 'paid' ? 'active' : ''}" onclick={() => { selectedFilter = 'paid'; selectedOrderIds = []; }}>
                รับยอดแล้ว ({liveOrders.filter((o) => o.status === 'paid').length})
            </button>
            <button class="category-tab-btn {selectedFilter === 'brewing' ? 'active' : ''}" onclick={() => { selectedFilter = 'brewing'; selectedOrderIds = []; }}>
                🍵 กำลังชง ({liveOrders.filter((o) => o.status === 'brewing').length})
            </button>
            <button class="category-tab-btn {selectedFilter === 'ready_to_ship' ? 'active' : ''}" onclick={() => { selectedFilter = 'ready_to_ship'; selectedOrderIds = []; }}>
                ✨ ชงเสร็จแล้ว ({readyToShipCount})
            </button>
            <button class="category-tab-btn {selectedFilter === 'delivering' ? 'active' : ''}" onclick={() => { selectedFilter = 'delivering'; selectedOrderIds = []; }}>
                🛵 กำลังส่ง ({liveOrders.filter((o) => o.status === 'delivering').length})
            </button>
            <button class="category-tab-btn {selectedFilter === 'completed' ? 'active' : ''}" onclick={() => { selectedFilter = 'completed'; selectedOrderIds = []; }}>
                ส่งแล้ววันนี้ ({todayCompletedCount})
            </button>
        </div>

        <!-- 🍵 การ์ดพับเก็บได้: สรุปคิวชงเครื่องดื่มและเช็คลิสต์บาริสต้า (Collapsible Drink Prep Summary Card) -->
        <div class="brew-summary-card" style="background: #ffffff; border: 1.5px solid #bbf7d0; border-radius: 16px; margin-bottom: 1.25rem; overflow: hidden; box-shadow: 0 3px 12px rgba(22, 101, 52, 0.06); transition: all 0.2s ease; width: 100%; max-width: 100%; box-sizing: border-box;">
            <!-- Header แถบหัวการ์ด (กดเพื่อยุบ/ขยายได้ตลอดเวลา) -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
                onclick={() => {
                    isBrewSummaryExpanded = !isBrewSummaryExpanded;
                    if (isBrewSummaryExpanded) {
                        selectedFilter = 'to_brew';
                    }
                }}
                style="display: flex; justify-content: space-between; align-items: center; padding: 0.85rem 1.15rem; background: #f0fdf4; cursor: pointer; user-select: none; border-bottom: {isBrewSummaryExpanded ? '1px solid #dcfce7' : 'none'}; gap: 0.75rem; flex-wrap: wrap; width: 100%; box-sizing: border-box;"
            >
                <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; flex: 1; min-width: 0;">
                    <span style="font-size: 1rem; font-weight: 800; color: #14532d; display: flex; align-items: center; gap: 0.4rem;">
                        🍵 สรุปคิวชงเครื่องดื่ม
                    </span>
                    <span style="background: #166534; color: #ffffff; font-size: 0.8rem; font-weight: 800; padding: 0.15rem 0.6rem; border-radius: 999px;">
                        {filteredTotalCups} แก้ว
                    </span>
                    {#if filteredTotalCups > 0}
                        <span style="font-size: 0.8rem; font-weight: 700; color: {checkedCupsCount === filteredTotalCups ? '#16a34a' : '#15803d'};">
                            · ชงแล้ว {checkedCupsCount}/{filteredTotalCups} แก้ว ({brewProgressPercent}%)
                        </span>
                    {/if}
                </div>

                <div style="display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0;">
                    <span style="font-size: 0.8rem; font-weight: 800; color: #166534; background: #dcfce7; padding: 0.25rem 0.65rem; border-radius: 8px; display: inline-flex; align-items: center; gap: 0.3rem;">
                        {isBrewSummaryExpanded ? '▲ ยุบเก็บ' : '▼ ขยายดูสรุป'}
                    </span>
                </div>
            </div>

            <!-- แถบ Progress บางๆ เมื่อยุบการ์ดไว้ (ให้บาริสต้าเห็นความคืบหน้าได้แม้พับเก็บ) -->
            {#if !isBrewSummaryExpanded && filteredTotalCups > 0}
                <div style="width: 100%; height: 4px; background: #e2e8f0;">
                    <div style="width: {brewProgressPercent}%; height: 100%; background: #16a34a; transition: width 0.25s ease;"></div>
                </div>
            {/if}

            <!-- เนื้อหาการ์ดสรุปคิวชง (แสดงเมื่อขยาย) -->
            {#if isBrewSummaryExpanded}
                <div style="padding: 1rem 1.15rem; background: #ffffff; width: 100%; box-sizing: border-box;">
                    <!-- ตัวกรองเลือกรอบส่ง (Filter by Delivery Round) -->
                    {#if Object.keys(availableDeliveryRounds).length > 1}
                        <div style="display: flex; gap: 0.35rem; overflow-x: auto; padding-bottom: 0.4rem; margin-bottom: 0.75rem; align-items: center; width: 100%; max-width: 100%; box-sizing: border-box; -webkit-overflow-scrolling: touch;">
                            <span style="font-size: 0.76rem; font-weight: 800; color: #475569; white-space: nowrap; margin-right: 0.2rem; flex-shrink: 0;">
                                🚚 แยกรอบส่ง:
                            </span>
                            <button
                                type="button"
                                onclick={() => (selectedRoundFilter = 'all')}
                                style="padding: 0.25rem 0.65rem; font-size: 0.75rem; font-weight: 700; border-radius: 999px; border: 1.5px solid {selectedRoundFilter === 'all' ? '#0284c7' : '#cbd5e1'}; background: {selectedRoundFilter === 'all' ? '#0284c7' : '#ffffff'}; color: {selectedRoundFilter === 'all' ? '#ffffff' : '#475569'}; cursor: pointer; white-space: nowrap; transition: all 0.15s ease; flex-shrink: 0;"
                            >
                                ทุกรอบส่ง ({filteredOrders.reduce((sum, o) => sum + (o.basket || []).reduce((bS, it) => bS + Math.max(1, Number(it.quantity) || 1), 0), 0)} แก้ว)
                            </button>
                            {#each Object.entries(availableDeliveryRounds) as [round, count]}
                                <button
                                    type="button"
                                    onclick={() => (selectedRoundFilter = round)}
                                    style="padding: 0.25rem 0.65rem; font-size: 0.75rem; font-weight: 700; border-radius: 999px; border: 1.5px solid {selectedRoundFilter === round ? '#0284c7' : '#cbd5e1'}; background: {selectedRoundFilter === round ? '#0284c7' : '#ffffff'}; color: {selectedRoundFilter === round ? '#ffffff' : '#475569'}; cursor: pointer; white-space: nowrap; transition: all 0.15s ease; flex-shrink: 0;"
                                >
                                    🚚 {round} ({count} แก้ว)
                                </button>
                            {/each}
                        </div>
                    {/if}

                    <!-- แถบ Progress Bar & ปุ่ม Action ของ Checklist -->
                    {#if filteredTotalCups > 0}
                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 0.75rem 0.95rem; margin-bottom: 1rem; width: 100%; box-sizing: border-box;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.5rem;">
                                <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; flex: 1; min-width: 0;">
                                    <span style="font-weight: 800; font-size: 0.86rem; color: #1e293b;">
                                        ความคืบหน้าการชง:
                                    </span>
                                    <span style="font-weight: 800; font-size: 0.88rem; color: {checkedCupsCount === filteredTotalCups ? '#16a34a' : '#166534'};">
                                        {checkedCupsCount} / {filteredTotalCups} แก้ว ({brewProgressPercent}%)
                                    </span>
                                    {#if selectedRoundFilter !== 'all'}
                                        <span style="background: #e0f2fe; color: #0369a1; font-size: 0.72rem; font-weight: 800; padding: 0.1rem 0.45rem; border-radius: 999px;">
                                            (เฉพาะ: {selectedRoundFilter})
                                        </span>
                                    {/if}
                                </div>
                                <div style="display: flex; gap: 0.35rem; flex-shrink: 0;">
                                    <button
                                        type="button"
                                        onclick={checkAllBrewItems}
                                        style="padding: 0.25rem 0.6rem; font-size: 0.74rem; font-weight: 700; background: #f0fdf4; border: 1px solid #86efac; color: #166534; border-radius: 6px; cursor: pointer;"
                                    >
                                        ☑️ ติ๊กทั้งหมด
                                    </button>
                                    <button
                                        type="button"
                                        onclick={resetBrewChecklist}
                                        style="padding: 0.25rem 0.6rem; font-size: 0.74rem; font-weight: 700; background: #ffffff; border: 1px solid #cbd5e1; color: #64748b; border-radius: 6px; cursor: pointer;"
                                    >
                                        🔄 ล้างที่ติ๊ก
                                    </button>
                                </div>
                            </div>

                            <!-- Progress Bar Fill -->
                            <div style="width: 100%; height: 7px; background: #e2e8f0; border-radius: 999px; overflow: hidden;">
                                <div
                                    style="width: {brewProgressPercent}%; height: 100%; background: linear-gradient(90deg, #16a34a, #15803d); transition: width 0.25s ease;"
                                ></div>
                            </div>

                            {#if checkedCupsCount === filteredTotalCups && filteredTotalCups > 0}
                                <div style="margin-top: 0.5rem; background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 0.35rem 0.65rem; text-align: center; color: #166534; font-size: 0.8rem; font-weight: 800;">
                                    🎉 ชงเครื่องดื่มครบทุกแก้วในหมวดนี้แล้ว!
                                </div>
                            {/if}
                        </div>
                    {/if}

                    <!-- รายการเมนูที่ต้องชง -->
                    {#if brewSummaryList.length === 0}
                        <div style="text-align: center; padding: 2rem 1rem; color: #64748b;">
                            <p style="font-size: 2rem; margin: 0 0 0.35rem 0;">🍵</p>
                            <h4 style="margin: 0; color: #334155; font-size: 0.95rem;">ไม่มีเครื่องดื่มที่ต้องชงในหมวดนี้</h4>
                            <p style="font-size: 0.78rem; margin: 0.25rem 0 0 0; color: #94a3b8;">
                                สลับแท็บตัวกรองหรือรอบส่งด้านบนเพื่อดูหมวดอื่นได้เลยนะคะ
                            </p>
                        </div>
                    {:else}
                        <div style="display: flex; flex-direction: column; gap: 0.85rem; width: 100%; box-sizing: border-box;">
                            {#each brewSummaryList as menu, menuIdx}
                                {@const menuAllChecked = isMenuAllChecked(menu)}
                                <div
                                    style="background: {menuAllChecked ? '#f8fafc' : '#ffffff'}; border: 1.5px solid {menuAllChecked ? '#bbf7d0' : '#e2e8f0'}; border-radius: 14px; padding: 0.85rem 1rem; box-shadow: 0 1px 4px rgba(0,0,0,0.02); transition: all 0.15s ease; width: 100%; box-sizing: border-box;"
                                >
                                    <!-- หัวการ์ดเมนู -->
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.65rem; flex-wrap: wrap; gap: 0.4rem; border-bottom: 1px dashed #e2e8f0; padding-bottom: 0.5rem; width: 100%; box-sizing: border-box;">
                                        <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; flex: 1; min-width: 0;">
                                            <span style="font-size: 0.92rem; font-weight: 800; color: #1e293b; word-break: break-word;">
                                                {menuIdx + 1}. {menu.menuName}
                                            </span>
                                            {#if menu.isFermented}
                                                <span style="background: #fef08a; color: #854d0e; font-size: 0.68rem; font-weight: 800; padding: 0.1rem 0.35rem; border-radius: 4px; flex-shrink: 0;">
                                                    เมนูบ่ม
                                                </span>
                                            {/if}
                                            <span style="background: #e0f2fe; color: #0369a1; font-size: 0.76rem; font-weight: 800; padding: 0.1rem 0.5rem; border-radius: 999px; flex-shrink: 0;">
                                                รวม {menu.totalCups} แก้ว
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onclick={() => toggleMenuAll(menu)}
                                            style="background: {menuAllChecked ? '#dcfce7' : '#f1f5f9'}; border: 1px solid {menuAllChecked ? '#86efac' : '#cbd5e1'}; color: {menuAllChecked ? '#166534' : '#475569'}; font-size: 0.72rem; font-weight: 700; padding: 0.2rem 0.55rem; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 0.25rem; flex-shrink: 0;"
                                        >
                                            {menuAllChecked ? '✓ เสร็จแล้วทั้งเมนู' : '✓ ติ๊กทั้งเมนู'}
                                        </button>
                                    </div>

                                    <!-- รายการระดับความหวาน & ช็อต & โน้ต (Checklist Items) -->
                                    <div style="display: flex; flex-direction: column; gap: 0.45rem; width: 100%; box-sizing: border-box;">
                                        {#each menu.sweetnessList as sweet}
                                            {@const itemKey = getBrewItemKey(menu.menuName, sweet.sweetness)}
                                            {@const isChecked = !!brewChecklist[itemKey]}
                                            <!-- svelte-ignore a11y_click_events_have_key_events -->
                                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                                            <div
                                                onclick={() => toggleChecklistItem(itemKey)}
                                                style="display: flex; align-items: flex-start; justify-content: space-between; gap: 0.6rem; padding: 0.55rem 0.75rem; border-radius: 8px; border: 1.5px solid {isChecked ? '#86efac' : '#f1f5f9'}; background: {isChecked ? '#f0fdf4' : '#f8fafc'}; cursor: pointer; transition: all 0.15s ease; width: 100%; box-sizing: border-box;"
                                            >
                                                <div style="display: flex; align-items: flex-start; gap: 0.55rem; flex: 1; min-width: 0;">
                                                    <!-- Custom styled checkbox -->
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onclick={(e) => e.stopPropagation()}
                                                        onchange={() => toggleChecklistItem(itemKey)}
                                                        style="width: 19px; height: 19px; accent-color: #16a34a; cursor: pointer; margin-top: 2px; flex-shrink: 0;"
                                                    />
                                                    <div style="flex: 1; min-width: 0;">
                                                        <div style="display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap;">
                                                            <span style="font-weight: 800; font-size: 0.88rem; color: {isChecked ? '#166534' : '#1e293b'}; text-decoration: {isChecked ? 'line-through' : 'none'};">
                                                                หวาน {sweet.sweetness}%
                                                            </span>
                                                            <span style="font-size: 0.82rem; font-weight: 800; color: {isChecked ? '#166534' : '#047857'};">
                                                                : {sweet.count} แก้ว
                                                            </span>
                                                        </div>

                                                        <!-- ท็อปปิ้ง / ช็อต ของความหวานนี้ -->
                                                        {#if Object.keys(sweet.addonBreakdown).length > 0}
                                                            <div style="display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.25rem;">
                                                                {#each Object.entries(sweet.addonBreakdown) as [addon, count]}
                                                                    <span style="display: inline-block; background: #dcfce7; color: #166534; font-size: 0.72rem; font-weight: 800; padding: 0.08rem 0.45rem; border-radius: 999px; border: 1px solid #86efac; word-break: break-word;">
                                                                        🍵 +{addon} ({count} แก้ว)
                                                                    </span>
                                                                {/each}
                                                                {#if sweet.normalAddonCount > 0}
                                                                    <span style="display: inline-block; background: #e2e8f0; color: #475569; font-size: 0.7rem; font-weight: 600; padding: 0.08rem 0.4rem; border-radius: 999px;">
                                                                        ปกติ ({sweet.normalAddonCount} แก้ว)
                                                                    </span>
                                                                {/if}
                                                            </div>
                                                        {/if}

                                                        <!-- รอบจัดส่ง / วันจัดส่ง / เวลาส่งย่อย ของความหวานนี้ -->
                                                        {#if Object.keys(sweet.timeBreakdown || sweet.roundBreakdown || {}).length > 0}
                                                            <div style="display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.25rem;">
                                                                {#each sortTimeBadges(Object.entries(sweet.timeBreakdown || sweet.roundBreakdown || {})) as [timeLabel, count]}
                                                                    <span style="display: inline-flex; align-items: center; gap: 0.2rem; background: #e0f2fe; color: #0369a1; font-size: 0.72rem; font-weight: 700; padding: 0.08rem 0.45rem; border-radius: 999px; border: 1px solid #bae6fd; word-break: break-word;">
                                                                        🚚 {timeLabel} ({count} แก้ว)
                                                                    </span>
                                                                {/each}
                                                                {#if Object.keys(sweet.dateBreakdown).length > 0}
                                                                    {#each Object.entries(sweet.dateBreakdown) as [date, count]}
                                                                        <span style="display: inline-block; background: #f8fafc; color: #475569; font-size: 0.7rem; font-weight: 600; padding: 0.08rem 0.4rem; border-radius: 999px; border: 1px solid #e2e8f0; word-break: break-word;">
                                                                            📅 {date}
                                                                        </span>
                                                                    {/each}
                                                                {/if}
                                                            </div>
                                                        {/if}

                                                        <!-- หมายเหตุ / โน้ต ของความหวานนี้ -->
                                                        {#if Object.keys(sweet.noteBreakdown).length > 0}
                                                            <div style="display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.25rem;">
                                                                {#each Object.entries(sweet.noteBreakdown) as [note, count]}
                                                                    <span style="display: inline-block; background: #fef3c7; color: #92400e; font-size: 0.72rem; font-weight: 700; padding: 0.08rem 0.45rem; border-radius: 999px; border: 1px solid #fde68a; word-break: break-word;">
                                                                        📝 {note} ({count} แก้ว)
                                                                    </span>
                                                                {/each}
                                                            </div>
                                                        {/if}
                                                    </div>
                                                </div>

                                                <div style="flex-shrink: 0; text-align: right; padding-left: 0.35rem;">
                                                    <span style="font-size: 1.05rem; font-weight: 900; color: {isChecked ? '#16a34a' : '#1e293b'}; background: {isChecked ? '#dcfce7' : '#f1f5f9'}; padding: 0.15rem 0.45rem; border-radius: 6px; display: inline-block;">
                                                        x{sweet.count}
                                                    </span>
                                                </div>
                                            </div>
                                        {/each}
                                    </div>

                                    <!-- สรุปรวมช็อตและโน้ตของทั้งเมนู (ถ้ามีมากกว่า 1 ระดับความหวาน) -->
                                    {#if menu.sweetnessList.length > 1 && (Object.keys(menu.overallAddons).length > 0 || Object.keys(menu.overallNotes).length > 0 || Object.keys(menu.overallRounds).length > 0)}
                                        <div style="margin-top: 0.65rem; padding-top: 0.5rem; border-top: 1px solid #f1f5f9; font-size: 0.76rem; color: #64748b; display: flex; flex-direction: column; gap: 0.25rem; width: 100%; box-sizing: border-box;">
                                            {#if Object.keys(menu.overallTimes || menu.overallRounds || {}).length > 0}
                                                <div style="display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap;">
                                                    <strong style="color: #334155;">รอบและเวลานัดส่งในเมนูนี้:</strong>
                                                    {#each sortTimeBadges(Object.entries(menu.overallTimes || menu.overallRounds || {})) as [timeLabel, count]}
                                                        <span style="color: #0369a1; font-weight: 700; background: #e0f2fe; padding: 0.05rem 0.4rem; border-radius: 999px; font-size: 0.72rem;">🚚 {timeLabel} ({count} แก้ว)</span>
                                                    {/each}
                                                </div>
                                            {/if}
                                            {#if Object.keys(menu.overallAddons).length > 0}
                                                <div style="display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap;">
                                                    <strong style="color: #334155;">รวมช็อตทั้งหมดในเมนูนี้:</strong>
                                                    {#each Object.entries(menu.overallAddons) as [addon, count]}
                                                        <span style="color: #166534; font-weight: 700; background: #dcfce7; padding: 0.05rem 0.4rem; border-radius: 999px;">+{addon} ({count} แก้ว)</span>
                                                    {/each}
                                                    {#if menu.totalNormalAddon > 0}
                                                        <span style="color: #64748b; background: #f1f5f9; padding: 0.05rem 0.35rem; border-radius: 999px;">ปกติ ({menu.totalNormalAddon} แก้ว)</span>
                                                    {/if}
                                                </div>
                                            {/if}
                                            {#if Object.keys(menu.overallNotes).length > 0}
                                                <div style="display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap;">
                                                    <strong style="color: #334155;">รวมโน้ตพิเศษทั้งหมด:</strong>
                                                    {#each Object.entries(menu.overallNotes) as [note, count]}
                                                        <span style="color: #b45309; font-weight: 700; background: #fef3c7; padding: 0.05rem 0.4rem; border-radius: 999px;">• {note} ({count} แก้ว)</span>
                                                    {/each}
                                                </div>
                                            {/if}
                                        </div>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    {/if}

                    <!-- ปุ่มยุบเก็บด้านล่าง เพื่อความสะดวกบนมือถือไม่ต้องเลื่อนขึ้นบนสุด -->
                    <div style="margin-top: 0.85rem; padding-top: 0.65rem; border-top: 1px dashed #e2e8f0; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; width: 100%; box-sizing: border-box;">
                        <span style="font-size: 0.76rem; color: #64748b; flex: 1; min-width: 180px;">
                            💡 ติ๊กที่รายการเพื่อมาร์กชงเสร็จ (ระบบนับความคืบหน้าเรียลไทม์)
                        </span>
                        <button
                            type="button"
                            onclick={() => (isBrewSummaryExpanded = false)}
                            style="background: #f1f5f9; border: 1px solid #cbd5e1; color: #475569; font-size: 0.75rem; font-weight: 700; padding: 0.25rem 0.65rem; border-radius: 6px; cursor: pointer; flex-shrink: 0;"
                        >
                            ▲ ยุบเก็บการ์ดสรุป
                        </button>
                    </div>
                </div>
            {/if}
        </div>

        <!-- กล่องเลือกทั้งหมด & คำสั่ง Bulk Action -->
        <div style="background: #ffffff; border: 1px solid var(--border-light); border-radius: 14px; padding: 0.85rem 1.25rem; margin-bottom: 1.25rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; width: 100%; max-width: 100%; box-sizing: border-box;">
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
            <div class="form-card admin-order-card" style="text-align: center; padding: 3rem 1.5rem; width: 100%; max-width: 100%; box-sizing: border-box;">
                <p style="font-size: 2.5rem; margin: 0 0 0.5rem 0;">📋</p>
                <h3 style="margin: 0; color: var(--matcha-deep);">ไม่มีคำสั่งซื้อในสถานะนี้</h3>
            </div>
        {:else}
            <div class="admin-orders-container" style="display: flex; flex-direction: column; gap: 1.25rem; width: 100%; max-width: 100%; box-sizing: border-box;">
                {#each filteredOrders as order, index}
                    <div 
                        class="form-card admin-order-card" 
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
                            width: 100%;
                            max-width: 100%;
                            box-sizing: border-box;
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
                                            · 🚚 วันส่ง: <strong>{formatThaiDateDisplay(order.deliveryDate)}</strong> ({order.deliveryRound || 'รอบปกติ'})
                                        {/if}
                                    </span>
                                </div>
                            </div>

                            <!-- ปุ่ม Action เดี่ยวสำหรับเปลี่ยนสถานะ -->
                            <div style="display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center;">
                                {#if order.status === 'pending'}
                                    <button 
                                        type="button"
                                        onclick={() => openSlipReviewModal(order)} 
                                        class="btn-matcha-primary" 
                                        style="padding: 0.45rem 0.95rem; font-size: 0.82rem; background: #d97706; display: inline-flex; align-items: center; gap: 0.35rem; font-weight: 700; border-radius: 8px;"
                                    >
                                        🔍 ตรวจคำขอ & สลิป
                                    </button>
                                    <button onclick={() => updateStatus(order.id, 'paid')} class="btn-matcha-primary" style="padding: 0.45rem 0.85rem; font-size: 0.8rem; background: #166534;">
                                        ✓ อนุมัติด่วน
                                    </button>
                                    <button onclick={() => updateStatus(order.id, 'cancelled')} class="btn-danger" style="padding: 0.45rem 0.85rem; font-size: 0.8rem;">
                                        ✕ ปฏิเสธ
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
                                <button
                                    type="button"
                                    onclick={() => openEditOrderModal(order)}
                                    style="padding: 0.45rem 0.85rem; font-size: 0.82rem; background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 6px; font-weight: 700; color: #334155; cursor: pointer; display: inline-flex; align-items: center; gap: 0.25rem;"
                                    title="แก้ไขข้อมูล สถานะ วันส่ง หรือรายการแก้ว"
                                >
                                    ✏️ แก้ไข
                                </button>
                            </div>
                        </div>

                        <!-- รายละเอียดผู้รับ & เครื่องดื่มที่สั่ง & สลิป -->
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; margin-top: 1rem;">
                            <!-- ข้อมูลผู้สั่ง -->
                            <div>
                                <p style="margin: 0; font-size: 0.75rem; color: var(--text-muted);">ผู้สั่งซื้อ & สถานที่จัดส่ง</p>
                                <p style="margin: 0; font-weight: 700; color: var(--matcha-deep); font-size: 0.95rem;">
                                    {order.name}{#if order.memberName && order.memberName.trim() !== order.name.trim()} <span style="color: #166534; font-size: 0.82em; font-weight: 700;">({order.memberName})</span>{/if} (<a href="tel:{order.phone}" style="color: var(--matcha-primary); text-decoration: none;">{order.phone}</a>)
                                </p>
                                <p style="margin: 0.35rem 0 0 0; font-weight: 600; color: var(--text-primary); font-size: 0.9rem;">
                                    📍 {order.address}
                                </p>
                                {#if order.deliveryRound}
                                    {@const parts = order.deliveryRound.split('·')}
                                    <p style="margin: 0.25rem 0 0 0; font-size: 0.8rem; color: #0284c7; font-weight: 700;">
                                        🚚 รอบส่ง: {parts[0].trim()} (วันที่ {order.deliveryDate || '-'})
                                    </p>
                                    {#if parts[1]}
                                        <p style="margin: 0.25rem 0 0 0;">
                                            <span style="display: inline-flex; align-items: center; gap: 0.25rem; background: #ecfdf5; color: #065f46; border: 1.5px solid #6ee7b7; padding: 0.15rem 0.55rem; border-radius: 8px; font-size: 0.78rem; font-weight: 800;">
                                                ⏰ {parts[1].trim()}
                                            </span>
                                        </p>
                                    {/if}
                                {/if}
                                {#if order.message}
                                    <p style="margin: 0.35rem 0 0 0; font-size: 0.8rem; color: var(--amber-tag); background: #fef3c7; padding: 0.3rem 0.5rem; border-radius: 6px; display: inline-block;">
                                        💬 หมายเหตุ: {order.message}
                                    </p>
                                {/if}
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
    <!-- แท็บ: ตัวช่วยในการจัดส่ง (Delivery Assistant)            -->
    <!-- ======================================================== -->
    {#if activeTab === 'delivery'}
        <div style="display: flex; flex-direction: column; gap: 1.25rem; width: 100%;">
            <!-- Header ส่วนหัวตัวช่วยจัดส่ง -->
            <div class="form-card" style="padding: 1.25rem 1.5rem; text-align: left; background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%); border: 1.5px solid #86efac;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                            <span style="font-size: 1.5rem;">🛵</span>
                            <h2 style="margin: 0; font-size: 1.35rem; color: #14532d; font-weight: 800;">
                                ตัวช่วยในการจัดส่ง (Delivery Assistant)
                            </h2>
                        </div>
                        <p style="margin: 0; font-size: 0.88rem; color: #166534;">
                            แสดงออเดอร์ที่ต้องส่งมอบในแต่ละรอบ แตะที่การ์ดเพื่อยืนยันการจัดส่งสำเร็จและแจ้งเตือนลูกค้าอัตโนมัติ
                        </p>
                    </div>

                    <!-- สรุปตัวเลขสถานะ -->
                    <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                        <div style="background: #ffffff; border: 1.5px solid #bbf7d0; padding: 0.5rem 0.9rem; border-radius: 12px; display: flex; align-items: center; gap: 0.4rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                            <span style="font-size: 1.2rem;">⏳</span>
                            <div>
                                <div style="font-size: 0.72rem; color: #64748b; font-weight: 600;">รอจัดส่ง</div>
                                <div style="font-size: 1.15rem; font-weight: 800; color: #d97706;">{pendingDeliveryOrders.length}</div>
                            </div>
                        </div>
                        <div style="background: #ffffff; border: 1.5px solid #bbf7d0; padding: 0.5rem 0.9rem; border-radius: 12px; display: flex; align-items: center; gap: 0.4rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                            <span style="font-size: 1.2rem;">✅</span>
                            <div>
                                <div style="font-size: 0.72rem; color: #64748b; font-weight: 600;">ส่งแล้ว</div>
                                <div style="font-size: 1.15rem; font-weight: 800; color: #16a34a;">{completedDeliveryOrders.length}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- แถบเลือกรอบส่ง (Round Filter Pills) -->
                <div style="margin-top: 1.2rem; padding-top: 1rem; border-top: 1px dashed #86efac; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                    <span style="font-size: 0.82rem; font-weight: 700; color: #166534; margin-right: 0.25rem;">
                        📍 เลือกรอบจัดส่ง:
                    </span>
                    <button
                        type="button"
                        onclick={() => (selectedDeliveryRoundFilter = 'auto')}
                        style="padding: 0.4rem 0.85rem; border-radius: 999px; font-size: 0.82rem; font-weight: 700; cursor: pointer; transition: all 0.2s; border: 1.5px solid {selectedDeliveryRoundFilter === 'auto' ? '#15803d' : '#bbf7d0'}; background: {selectedDeliveryRoundFilter === 'auto' ? '#15803d' : '#ffffff'}; color: {selectedDeliveryRoundFilter === 'auto' ? '#ffffff' : '#166534'};"
                    >
                        ⏰ ตรวจจับอัตโนมัติตามเวลา ({settings.deliveryRounds.find(r => r.id === detectCurrentDeliveryRoundId())?.name || 'รอบปัจจุบัน'})
                    </button>
                    {#each settings.deliveryRounds as round}
                        <button
                            type="button"
                            onclick={() => (selectedDeliveryRoundFilter = round.id)}
                            style="padding: 0.4rem 0.85rem; border-radius: 999px; font-size: 0.82rem; font-weight: 700; cursor: pointer; transition: all 0.2s; border: 1.5px solid {selectedDeliveryRoundFilter === round.id ? '#15803d' : '#bbf7d0'}; background: {selectedDeliveryRoundFilter === round.id ? '#15803d' : '#ffffff'}; color: {selectedDeliveryRoundFilter === round.id ? '#ffffff' : '#166534'};"
                        >
                            {round.name} ({round.timeSlot})
                        </button>
                    {/each}
                    <button
                        type="button"
                        onclick={() => (selectedDeliveryRoundFilter = 'all')}
                        style="padding: 0.4rem 0.85rem; border-radius: 999px; font-size: 0.82rem; font-weight: 700; cursor: pointer; transition: all 0.2s; border: 1.5px solid {selectedDeliveryRoundFilter === 'all' ? '#15803d' : '#bbf7d0'}; background: {selectedDeliveryRoundFilter === 'all' ? '#15803d' : '#ffffff'}; color: {selectedDeliveryRoundFilter === 'all' ? '#ffffff' : '#166534'};"
                    >
                        📦 ทุกรอบวันนี้ ({orders.filter(o => (o.deliveryDate ? o.deliveryDate === todayDateStr : o.createdAt.startsWith(todayDateStr)) && o.status !== 'cancelled').length})
                    </button>
                </div>
            </div>

            <!-- รายการออเดอร์ที่ต้องจัดส่ง (Pending Orders Grid) -->
            {#if pendingDeliveryOrders.length === 0}
                <div class="form-card" style="padding: 3rem 1.5rem; text-align: center; background: #ffffff;">
                    <div style="font-size: 3rem; margin-bottom: 0.75rem;">🎉</div>
                    <h3 style="font-size: 1.2rem; color: #15803d; margin: 0 0 0.5rem 0; font-weight: 800;">
                        ไม่มีออเดอร์ค้างส่งในรอบนี้!
                    </h3>
                    <p style="font-size: 0.88rem; color: var(--text-muted); margin: 0;">
                        ออเดอร์ทั้งหมดในรอบนี้จัดส่งเรียบร้อยแล้ว หรือยังไม่มีออเดอร์สั่งเข้ามาในช่วงเวลานี้
                    </p>
                </div>
            {:else}
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 1rem; align-items: start;">
                    {#each pendingDeliveryOrders as order (order.id)}
                        <!-- การ์ดออเดอร์สำหรับจัดส่ง (แตะเพื่อกดยืนยันส่ง) -->
                        <div 
                            role="button"
                            tabindex="0"
                            onclick={() => handleConfirmDelivery(order)}
                            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleConfirmDelivery(order); }}
                            style="background: #ffffff; border: 2px solid #bbf7d0; border-radius: 16px; overflow: hidden; box-shadow: 0 3px 12px rgba(0,0,0,0.06); cursor: pointer; transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s; text-align: left; position: relative;"
                            onmouseenter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(34, 197, 94, 0.15)'; }}
                            onmouseleave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = '#bbf7d0'; e.currentTarget.style.boxShadow = '0 3px 12px rgba(0,0,0,0.06)'; }}
                        >
                            <!-- หัวการ์ด: คิว + ชื่อผู้รับ + รอบส่ง -->
                            <div style="background: #f0fdf4; padding: 0.85rem 1rem; border-bottom: 1.5px solid #dcfce7; display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                                <div style="display: flex; align-items: center; gap: 0.5rem;">
                                    <span style="background: #15803d; color: #ffffff; font-weight: 800; font-size: 0.85rem; padding: 0.2rem 0.55rem; border-radius: 8px;">
                                        #{order.order_id || order.id.slice(-6)}
                                    </span>
                                    <strong style="font-size: 1.05rem; color: #14532d;">
                                        คุณ {order.name}
                                        {#if order.memberName && order.memberName.trim() !== order.name.trim()}
                                            <span style="font-size: 0.82rem; color: #166534; font-weight: 700;">({order.memberName})</span>
                                        {/if}
                                    </strong>
                                </div>
                                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem;">
                                    <span style="font-size: 0.75rem; background: #dcfce7; color: #166534; font-weight: 700; padding: 0.2rem 0.55rem; border-radius: 6px;">
                                        {(order.deliveryRound || 'รอบปกติ').split('·')[0].trim()}
                                    </span>
                                    {#if (order.deliveryRound || '').includes('·')}
                                        {@const subTime = (order.deliveryRound || '').split('·').slice(1).join(' · ').trim()}
                                        <span style="font-size: 0.75rem; background: #fef08a; color: #854d0e; font-weight: 800; padding: 0.18rem 0.55rem; border-radius: 6px; border: 1.5px solid #fde047; white-space: nowrap; box-shadow: 0 1px 3px rgba(133, 77, 14, 0.1);">
                                            ⏰ {subTime}
                                        </span>
                                    {/if}
                                </div>
                            </div>

                            <!-- เนื้อหาการ์ด: ที่อยู่ + เบอร์โทร + รายการเมนูและรายละเอียด -->
                            <div style="padding: 1rem;">
                                {#if (order.deliveryRound || '').includes('·')}
                                    {@const subTime = (order.deliveryRound || '').split('·').slice(1).join(' · ').trim()}
                                    <div style="background: #fffbeb; border: 1.5px solid #fde68a; border-radius: 8px; padding: 0.4rem 0.65rem; margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.4rem; color: #92400e; font-size: 0.82rem; font-weight: 800;">
                                        <span>⏰</span>
                                        <span>เวลานัดส่ง: <strong style="color: #b45309; text-decoration: underline;">{subTime}</strong></span>
                                    </div>
                                {/if}
                                <!-- สถานที่จัดส่ง -->
                                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 0.65rem 0.8rem; margin-bottom: 0.85rem;">
                                    <div style="display: flex; align-items: flex-start; gap: 0.4rem; font-size: 0.92rem; color: #1e293b; font-weight: 700; line-height: 1.4;">
                                        <span>📍</span>
                                        <span>{order.address}</span>
                                    </div>
                                    {#if order.phone}
                                        <div style="margin-top: 0.35rem; display: flex; align-items: center; gap: 0.35rem; font-size: 0.82rem; color: #64748b;">
                                            <span>📞</span>
                                            <a 
                                                href="tel:{order.phone}" 
                                                onclick={(e) => e.stopPropagation()}
                                                style="color: #0284c7; font-weight: 700; text-decoration: underline;"
                                            >
                                                {order.phone} (กดโทรออก)
                                            </a>
                                        </div>
                                    {/if}
                                </div>

                                <!-- รายการเมนู + รายละเอียด (ความหวาน/ท็อปปิ้ง/โน้ต) -->
                                <div style="margin-bottom: 0.85rem;">
                                    <div style="font-size: 0.78rem; font-weight: 800; color: #475569; text-transform: uppercase; margin-bottom: 0.4rem; letter-spacing: 0.03em;">
                                        🍵 รายการเครื่องดื่ม ({(order.basket || []).reduce((acc: number, i: any) => acc + (i.quantity || 1), 0)} แก้ว):
                                    </div>
                                    <div style="display: flex; flex-direction: column; gap: 0.45rem;">
                                        {#each order.basket || [] as item}
                                            <div style="background: #fafaf9; border-left: 3px solid #15803d; padding: 0.45rem 0.65rem; border-radius: 4px;">
                                                <div style="display: flex; justify-content: space-between; align-items: baseline;">
                                                    <span style="font-weight: 700; font-size: 0.9rem; color: #1c1917;">
                                                        {item.thaiName || item.name || 'เครื่องดื่ม'}
                                                    </span>
                                                    <span style="font-weight: 800; font-size: 0.88rem; color: #15803d; background: #dcfce7; padding: 0.05rem 0.4rem; border-radius: 4px;">
                                                        x{item.quantity || 1}
                                                    </span>
                                                </div>
                                                <!-- รายละเอียดตัวเลือก -->
                                                <div style="font-size: 0.78rem; color: #57534e; margin-top: 0.15rem; line-height: 1.35;">
                                                    <span style="color: #d97706; font-weight: 600;">
                                                        หวาน: {item.sweetness !== undefined ? `${item.sweetness}%` : 'ปกติ'}
                                                    </span>
                                                    {#if item.addonName}
                                                        <span style="color: #7c3aed; font-weight: 600;"> • {item.addonName}</span>
                                                    {/if}
                                                    {#if item.note}
                                                        <div style="margin-top: 0.15rem; color: #b91c1c; font-style: italic;">
                                                            📝 {item.note}
                                                        </div>
                                                    {/if}
                                                </div>
                                            </div>
                                        {/each}
                                    </div>
                                </div>
                            </div>

                            <!-- ปุ่มแถบล่างแตะเพื่อยืนยันส่งสำเร็จ -->
                            <div style="background: #15803d; color: #ffffff; padding: 0.65rem 1rem; text-align: center; font-size: 0.88rem; font-weight: 800; display: flex; align-items: center; justify-content: center; gap: 0.4rem; letter-spacing: 0.02em;">
                                <span>🛵</span>
                                <span>แตะที่นี่เพื่อยืนยันส่งสำเร็จ</span>
                                <span>→</span>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}

            <!-- ส่วนออเดอร์ที่ส่งเสร็จแล้วในรอบนี้ (พับเก็บได้) -->
            {#if completedDeliveryOrders.length > 0}
                <div style="margin-top: 1rem;">
                    <button
                        type="button"
                        onclick={() => (showCompletedDeliveryList = !showCompletedDeliveryList)}
                        style="width: 100%; padding: 0.75rem 1rem; background: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: 12px; font-size: 0.88rem; font-weight: 700; color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: space-between; transition: background 0.2s;"
                        onmouseenter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                        onmouseleave={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    >
                        <span>✅ รายการที่จัดส่งสำเร็จแล้วในรอบนี้ ({completedDeliveryOrders.length} ออเดอร์)</span>
                        <span>{showCompletedDeliveryList ? '▲ ซ่อน' : '▼ ดูรายการ'}</span>
                    </button>

                    {#if showCompletedDeliveryList}
                        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 0.75rem; margin-top: 0.75rem;">
                            {#each completedDeliveryOrders as order (order.id)}
                                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 0.8rem; text-align: left; opacity: 0.85;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                                        <div style="display: flex; align-items: center; gap: 0.35rem;">
                                            <span style="font-size: 0.75rem; background: #cbd5e1; color: #334155; font-weight: 700; padding: 0.1rem 0.4rem; border-radius: 4px;">
                                                #{order.order_id || order.id.slice(-6)}
                                            </span>
                                            <strong style="color: #334155; font-size: 0.95rem;">
                                                คุณ {order.name}
                                                {#if order.memberName && order.memberName.trim() !== order.name.trim()}
                                                    <span style="font-size: 0.82rem; color: #166534; font-weight: 700;">({order.memberName})</span>
                                                {/if}
                                            </strong>
                                        </div>
                                        <span style="color: #16a34a; font-size: 0.75rem; font-weight: 700; background: #dcfce7; padding: 0.15rem 0.45rem; border-radius: 999px;">
                                            ✓ ส่งสำเร็จแล้ว
                                        </span>
                                    </div>
                                    <div style="font-size: 0.8rem; color: #64748b;">📍 {order.address}</div>
                                    <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.25rem;">
                                        {(order.basket || []).map((i: any) => `${i.thaiName || i.name || 'เครื่องดื่ม'} (${i.quantity || 1})`).join(', ')}
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/if}
        </div>
    {/if}

    <!-- ======================================================== -->
    <!-- แท็บ: ประวัติคำสั่งซื้อทั้งหมด (Order History & Archive)     -->
    <!-- ======================================================== -->
    {#if activeTab === 'history'}
        <div style="display: flex; flex-direction: column; gap: 1.25rem; width: 100%;">
            <!-- Header ประวัติคำสั่งซื้อ -->
            <div class="form-card" style="padding: 1.25rem 1.5rem; text-align: left; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border: 1.5px solid #cbd5e1;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                            <span style="font-size: 1.5rem;">📜</span>
                            <h2 style="margin: 0; font-size: 1.35rem; color: #1e293b; font-weight: 800;">
                                ประวัติคำสั่งซื้อ & รายการย้อนหลัง (Order History)
                            </h2>
                        </div>
                        <p style="margin: 0; font-size: 0.88rem; color: #64748b;">
                            รวมประวัติออเดอร์ทั้งหมดในอดีต รายการที่จัดส่งเสร็จสิ้น และรายการที่ยกเลิก
                        </p>
                    </div>

                    <!-- สรุปตัวเลขสถิติของช่วงเวลาที่เลือก -->
                    <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                        <div style="background: #ffffff; border: 1px solid #e2e8f0; padding: 0.5rem 0.9rem; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                            <div style="font-size: 0.72rem; color: #64748b; font-weight: 600;">💰 ยอดขายช่วงนี้</div>
                            <div style="font-size: 1.15rem; font-weight: 800; color: #15803d;">{Number(historyTotalSales.toFixed(2))} ฿</div>
                        </div>
                        <div style="background: #ffffff; border: 1px solid #e2e8f0; padding: 0.5rem 0.9rem; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                            <div style="font-size: 0.72rem; color: #64748b; font-weight: 600;">✅ สำเร็จแล้ว</div>
                            <div style="font-size: 1.15rem; font-weight: 800; color: #16a34a;">{historyCompletedCount}</div>
                        </div>
                        <div style="background: #ffffff; border: 1px solid #fecaca; padding: 0.5rem 0.9rem; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                            <div style="font-size: 0.72rem; color: #991b1b; font-weight: 600;">🚫 ยกเลิก</div>
                            <div style="font-size: 1.15rem; font-weight: 800; color: #dc2626;">{historyCancelledCount}</div>
                        </div>
                    </div>
                </div>

                <!-- แถบเครื่องมือกรองวันที่ & ค้นหา -->
                <div style="margin-top: 1.25rem; padding-top: 1rem; border-top: 1px dashed #cbd5e1; display: flex; flex-direction: column; gap: 0.85rem;">
                    <!-- แถวที่ 1: ช่วงวันที่ -->
                    <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                        <span style="font-size: 0.82rem; font-weight: 700; color: #475569; margin-right: 0.25rem;">
                            📅 วันที่:
                        </span>
                        <button
                            type="button"
                            onclick={() => (historyDateRange = 'recent7')}
                            style="padding: 0.35rem 0.85rem; border-radius: 999px; font-size: 0.8rem; font-weight: 800; cursor: pointer; transition: all 0.2s; border: 1.5px solid {historyDateRange === 'recent7' ? '#047857' : '#cbd5e1'}; background: {historyDateRange === 'recent7' ? '#047857' : '#ffffff'}; color: {historyDateRange === 'recent7' ? '#ffffff' : '#475569'}; box-shadow: {historyDateRange === 'recent7' ? '0 2px 6px rgba(4,120,87,0.2)' : 'none'};"
                        >
                            🗓️ 7 วันล่าสุดที่เปิด ({recent7OpenDays.length} วัน)
                        </button>
                        <button
                            type="button"
                            onclick={() => (historyDateRange = 'today')}
                            style="padding: 0.35rem 0.8rem; border-radius: 999px; font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: all 0.2s; border: 1.5px solid {historyDateRange === 'today' ? '#1e293b' : '#cbd5e1'}; background: {historyDateRange === 'today' ? '#1e293b' : '#ffffff'}; color: {historyDateRange === 'today' ? '#ffffff' : '#475569'};"
                        >
                            วันนี้
                        </button>
                        <button
                            type="button"
                            onclick={() => (historyDateRange = 'yesterday')}
                            style="padding: 0.35rem 0.8rem; border-radius: 999px; font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: all 0.2s; border: 1.5px solid {historyDateRange === 'yesterday' ? '#1e293b' : '#cbd5e1'}; background: {historyDateRange === 'yesterday' ? '#1e293b' : '#ffffff'}; color: {historyDateRange === 'yesterday' ? '#ffffff' : '#475569'};"
                        >
                            เมื่อวาน
                        </button>
                        <button
                            type="button"
                            onclick={() => (historyDateRange = 'all')}
                            style="padding: 0.35rem 0.8rem; border-radius: 999px; font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: all 0.2s; border: 1.5px solid {historyDateRange === 'all' ? '#1e293b' : '#cbd5e1'}; background: {historyDateRange === 'all' ? '#1e293b' : '#ffffff'}; color: {historyDateRange === 'all' ? '#ffffff' : '#475569'};"
                        >
                            ทั้งหมดทุกวัน ({orders.length})
                        </button>
                        <div style="display: inline-flex; align-items: center; gap: 0.35rem;">
                            <input
                                type="date"
                                bind:value={historyCustomDate}
                                onchange={() => (historyDateRange = 'custom')}
                                style="padding: 0.3rem 0.6rem; border-radius: 8px; border: 1.5px solid {historyDateRange === 'custom' ? '#1e293b' : '#cbd5e1'}; font-size: 0.8rem;"
                            />
                        </div>
                    </div>

                    <!-- แถวที่ 2: ฟิลเตอร์สถานะ & ช่องค้นหา -->
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
                        <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
                            <button
                                type="button"
                                onclick={() => (historyStatusFilter = 'all')}
                                style="padding: 0.35rem 0.75rem; border-radius: 8px; font-size: 0.8rem; font-weight: 700; cursor: pointer; border: 1.5px solid {historyStatusFilter === 'all' ? '#0284c7' : '#cbd5e1'}; background: {historyStatusFilter === 'all' ? '#0284c7' : '#ffffff'}; color: {historyStatusFilter === 'all' ? '#ffffff' : '#334155'};"
                            >
                                ทั้งหมด ({historyFilteredOrders.length})
                            </button>
                            <button
                                type="button"
                                onclick={() => (historyStatusFilter = 'completed')}
                                style="padding: 0.35rem 0.75rem; border-radius: 8px; font-size: 0.8rem; font-weight: 700; cursor: pointer; border: 1.5px solid {historyStatusFilter === 'completed' ? '#16a34a' : '#cbd5e1'}; background: {historyStatusFilter === 'completed' ? '#16a34a' : '#ffffff'}; color: {historyStatusFilter === 'completed' ? '#ffffff' : '#334155'};"
                            >
                                ✅ ส่งสำเร็จแล้ว ({orders.filter(o => o.status === 'completed').length})
                            </button>
                            <button
                                type="button"
                                onclick={() => (historyStatusFilter = 'cancelled')}
                                style="padding: 0.35rem 0.75rem; border-radius: 8px; font-size: 0.8rem; font-weight: 700; cursor: pointer; border: 1.5px solid {historyStatusFilter === 'cancelled' ? '#dc2626' : '#fecaca'}; background: {historyStatusFilter === 'cancelled' ? '#dc2626' : '#fff5f5'}; color: {historyStatusFilter === 'cancelled' ? '#ffffff' : '#b91c1c'};"
                            >
                                🚫 ยกเลิกแล้ว ({orders.filter(o => o.status === 'cancelled').length})
                            </button>
                            <button
                                type="button"
                                onclick={() => (historyStatusFilter = 'pending')}
                                style="padding: 0.35rem 0.75rem; border-radius: 8px; font-size: 0.8rem; font-weight: 700; cursor: pointer; border: 1.5px solid {historyStatusFilter === 'pending' ? '#d97706' : '#cbd5e1'}; background: {historyStatusFilter === 'pending' ? '#d97706' : '#ffffff'}; color: {historyStatusFilter === 'pending' ? '#ffffff' : '#334155'};"
                            >
                                🔔 รอตรวจสลิป ({orders.filter(o => o.status === 'pending').length})
                            </button>
                        </div>

                        <!-- ช่องค้นหาในประวัติ -->
                        <div style="flex: 1; max-width: 320px; min-width: 200px;">
                            <input
                                type="text"
                                bind:value={historySearchQuery}
                                placeholder="🔍 ค้นชื่อ, เบอร์โทร, เลขออเดอร์..."
                                style="width: 100%; padding: 0.4rem 0.75rem; border-radius: 8px; border: 1.5px solid #cbd5e1; font-size: 0.85rem;"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <!-- รายการออเดอร์ในประวัติ -->
            {#if historyFilteredOrders.length === 0}
                <div class="form-card" style="padding: 3rem 1.5rem; text-align: center; background: #ffffff;">
                    <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📭</div>
                    <h3 style="font-size: 1.15rem; color: #475569; margin: 0 0 0.5rem 0;">
                        ไม่พบรายการคำสั่งซื้อในช่วงเวลานี้
                    </h3>
                    <p style="font-size: 0.85rem; color: #94a3b8; margin: 0;">
                        ลองปรับเปลี่ยนเงื่อนไขวันที่ หรือตัวกรองสถานะด้านบนนะคะ
                    </p>
                </div>
            {:else}
                <div style="display: flex; flex-direction: column; gap: 1rem; width: 100%; max-width: 100%; box-sizing: border-box;">
                    <!-- แถบควบคุมขยาย/ยุบทั้งหมด -->
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap; padding: 0 0.25rem;">
                        <span style="font-size: 0.84rem; color: #475569; font-weight: 700;">
                            📅 แสดงประวัติแยกตามวันที่เปิดร้าน ({historyGroupedByDay.length} วัน • {historyFilteredOrders.length} ออเดอร์):
                        </span>
                        <div style="display: flex; gap: 0.35rem;">
                            <button
                                type="button"
                                onclick={expandAllHistoryDays}
                                style="padding: 0.25rem 0.65rem; font-size: 0.75rem; font-weight: 700; background: #ffffff; border: 1.5px solid #cbd5e1; color: #334155; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 0.25rem;"
                            >
                                ➕ ขยายทุกวัน
                            </button>
                            <button
                                type="button"
                                onclick={collapseAllHistoryDays}
                                style="padding: 0.25rem 0.65rem; font-size: 0.75rem; font-weight: 700; background: #ffffff; border: 1.5px solid #cbd5e1; color: #334155; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 0.25rem;"
                            >
                                ➖ ยุบทุกวัน
                            </button>
                        </div>
                    </div>

                    <!-- รายการกลุ่มแยกตามวัน (Daily Accordions) -->
                    {#each historyGroupedByDay as dayGroup, groupIdx (dayGroup.date)}
                        {@const isExpanded = isDayExpanded(dayGroup.date, groupIdx)}
                        <div style="background: #ffffff; border: 1.5px solid {dayGroup.isToday ? '#86efac' : '#e2e8f0'}; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.04); transition: all 0.2s ease;">
                            <!-- หัวแถบประจำวัน (กดเปิด/ปิดได้) -->
                            <button
                                type="button"
                                onclick={() => toggleHistoryDay(dayGroup.date, groupIdx)}
                                style="width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 0.85rem 1.15rem; background: {dayGroup.isToday ? '#f0fdf4' : isExpanded ? '#f8fafc' : '#ffffff'}; border: none; cursor: pointer; text-align: left; gap: 0.75rem; flex-wrap: wrap; box-sizing: border-box; transition: background 0.15s ease;"
                            >
                                <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                                    <span style="font-size: 1rem; font-weight: 800; color: #1e293b;">
                                        📅 {dayGroup.dateFormatted}
                                    </span>
                                    {#if dayGroup.isToday}
                                        <span style="background: #dcfce7; color: #166534; font-size: 0.72rem; font-weight: 800; padding: 0.15rem 0.5rem; border-radius: 999px; border: 1px solid #86efac;">
                                            วันนี้
                                        </span>
                                    {:else if dayGroup.isYesterday}
                                        <span style="background: #e0f2fe; color: #0369a1; font-size: 0.72rem; font-weight: 800; padding: 0.15rem 0.5rem; border-radius: 999px;">
                                            เมื่อวาน
                                        </span>
                                    {/if}
                                    <span style="background: #f1f5f9; color: #475569; font-size: 0.76rem; font-weight: 700; padding: 0.15rem 0.55rem; border-radius: 999px;">
                                        {dayGroup.orders.length} ออเดอร์ ({dayGroup.totalCups} แก้ว)
                                    </span>
                                    {#if dayGroup.completedCount > 0}
                                        <span style="background: #dcfce7; color: #166534; font-size: 0.72rem; font-weight: 700; padding: 0.1rem 0.45rem; border-radius: 6px;">
                                            ✅ ส่งแล้ว {dayGroup.completedCount}
                                        </span>
                                    {/if}
                                    {#if dayGroup.cancelledCount > 0}
                                        <span style="background: #fee2e2; color: #991b1b; font-size: 0.72rem; font-weight: 700; padding: 0.1rem 0.45rem; border-radius: 6px;">
                                            🚫 ยกเลิก {dayGroup.cancelledCount}
                                        </span>
                                    {/if}
                                </div>

                                <div style="display: flex; align-items: center; gap: 0.75rem; flex-shrink: 0;">
                                    <span style="font-size: 1rem; font-weight: 800; color: #15803d; background: #ecfdf5; padding: 0.2rem 0.6rem; border-radius: 8px; border: 1px solid #a7f3d0;">
                                        ฿{dayGroup.totalSales.toLocaleString()}
                                    </span>
                                    <span style="font-size: 0.8rem; color: #64748b; font-weight: 800; background: #f1f5f9; padding: 0.2rem 0.5rem; border-radius: 6px;">
                                        {isExpanded ? '▲ ยุบเก็บ' : '▼ ขยายดูรายการ'}
                                    </span>
                                </div>
                            </button>

                            <!-- รายการออเดอร์ในวันนี้ (แสดงเมื่อขยาย) -->
                            {#if isExpanded}
                                <div style="padding: 1rem 1.15rem; border-top: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 1rem; background: #fafaf9; width: 100%; box-sizing: border-box;">
                                    {#each dayGroup.orders as order (order.id)}
                                        <div 
                                            class="form-card admin-order-card" 
                                            style="
                                                padding: 1.25rem; 
                                                text-align: left; 
                                                border-left: 6px solid {
                                                    order.status === 'completed' ? 'var(--green-status)' : 
                                                    order.status === 'cancelled' ? '#ef4444' : 
                                                    order.status === 'ready_to_ship' ? '#0284c7' :
                                                    order.status === 'brewing' ? 'var(--matcha-primary)' : 
                                                    order.status === 'delivering' ? 'var(--gold-accent, #d97706)' : '#d97706'
                                                }; 
                                                {order.status === 'cancelled' ? 'background: #fff8f8; opacity: 0.9;' : ''}
                                                width: 100%;
                                                max-width: 100%;
                                                box-sizing: border-box;
                                            "
                                        >
                                            <!-- ส่วนหัวการ์ด -->
                                            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.75rem; padding-bottom: 0.65rem; border-bottom: 1px solid var(--border-light);">
                                                <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                                                    <h3 style="margin: 0; font-size: 1.1rem; color: var(--matcha-deep);">
                                                        {order.order_id || order.id}
                                                    </h3>
                                                    <span class="status-pill {order.status}">
                                                        <span class="pulse-dot"></span>
                                                        {getStatusName(order.status)}
                                                    </span>
                                                    {#if order.status === 'cancelled'}
                                                        <span style="background: #fee2e2; color: #b91c1c; font-size: 0.75rem; font-weight: 800; padding: 0.15rem 0.55rem; border-radius: 6px;">
                                                            🚫 ยกเลิกแล้ว
                                                        </span>
                                                    {/if}
                                                </div>

                                                <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                                                    <span style="font-size: 0.8rem; color: var(--text-muted);">
                                                        สั่งเมื่อ: {formatTime(order.createdAt)}
                                                    </span>
                                                    <select 
                                                        class="form-select" 
                                                        style="padding: 0.35rem 0.65rem; font-size: 0.8rem; border-radius: 8px;"
                                                        value={order.status}
                                                        onchange={(e) => updateStatus(order.id, (e.target as HTMLSelectElement).value as any)}
                                                    >
                                                        <option value="pending">รอตรวจสลิป</option>
                                                        <option value="paid">รับยอดแล้ว</option>
                                                        <option value="brewing">กำลังชง</option>
                                                        <option value="ready_to_ship">ชงเสร็จแล้ว</option>
                                                        <option value="delivering">กำลังส่ง</option>
                                                        <option value="completed">ส่งสำเร็จ</option>
                                                        <option value="cancelled">ยกเลิก</option>
                                                    </select>
                                                    {#if order.status === 'pending'}
                                                        <button
                                                            type="button"
                                                            onclick={() => openSlipReviewModal(order)}
                                                            style="padding: 0.35rem 0.75rem; font-size: 0.78rem; background: #d97706; color: #ffffff; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 0.25rem;"
                                                            title="เปิดหน้าต่างตรวจคำขออนุมัติสลิป"
                                                        >
                                                            🔍 ตรวจสลิป
                                                        </button>
                                                    {/if}
                                                    <button
                                                        type="button"
                                                        onclick={() => openEditOrderModal(order)}
                                                        style="padding: 0.35rem 0.75rem; font-size: 0.78rem; background: #ffffff; border: 1.5px solid #cbd5e1; border-radius: 8px; font-weight: 700; color: #334155; cursor: pointer; display: inline-flex; align-items: center; gap: 0.25rem;"
                                                        title="แก้ไขข้อมูล สถานะ วันส่ง หรือรายการแก้ว"
                                                    >
                                                        ✏️ แก้ไข
                                                    </button>
                                                </div>
                                            </div>

                                            <!-- ข้อมูลลูกค้า & วันจัดส่ง -->
                                            <div style="margin: 0.75rem 0; font-size: 0.88rem; display: flex; flex-direction: column; gap: 0.3rem;">
                                                <div>
                                                    <strong>ลูกค้า:</strong> {order.name}{#if order.memberName && order.memberName.trim() !== order.name.trim()} <span style="color: #166534; font-weight: 700;">({order.memberName})</span>{/if} (โทร: <a href="tel:{order.phone}" style="color: var(--matcha-deep); font-weight: 700;">{order.phone}</a>)
                                                </div>
                                                <div><strong>สถานที่จัดส่ง:</strong> {order.address}</div>
                                                <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; font-size: 0.82rem; color: #475569; align-items: center;">
                                                    <span>📅 วันที่ส่ง: <strong>{formatThaiDateDisplay(order.deliveryDate || order.createdAt.slice(0, 10))}</strong></span>
                                                    <span>⏰ รอบส่ง: <strong>{(order.deliveryRound || 'รอบปกติ').split('·')[0].trim()}</strong></span>
                                                    {#if (order.deliveryRound || '').includes('·')}
                                                        <span style="background: #fef08a; color: #854d0e; font-weight: 800; padding: 0.1rem 0.45rem; border-radius: 6px; border: 1px solid #fde047;">
                                                            ⏰ {(order.deliveryRound || '').split('·').slice(1).join(' · ').trim()}
                                                        </span>
                                                    {/if}
                                                </div>
                                                {#if order.message}
                                                    <div style="background: #f8fafc; border-radius: 6px; padding: 0.35rem 0.6rem; font-size: 0.82rem; color: #64748b;">
                                                        <strong>โน้ต:</strong> {order.message}
                                                    </div>
                                                {/if}
                                            </div>

                                            <!-- รายการเครื่องดื่ม & สลิป -->
                                            <div style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 1rem; padding-top: 0.65rem; border-top: 1px dashed var(--border-light);">
                                                <div style="flex: 1; min-width: 200px;">
                                                    <div style="font-size: 0.82rem; font-weight: 700; color: var(--matcha-deep); margin-bottom: 0.35rem;">รายการสินค้า:</div>
                                                    {#each order.basket as item}
                                                        <div style="font-size: 0.85rem; color: #334155; margin-bottom: 0.2rem;">
                                                            • {item.thaiName || item.name} x{item.quantity} (หวาน {item.sweetness ?? 50}%)
                                                            {#if item.addonName} <span style="color: #15803d; font-size: 0.8rem;">(+{item.addonName})</span>{/if}
                                                            {#if item.note} <span style="color: #b45309; font-size: 0.8rem;">[{item.note}]</span>{/if}
                                                        </div>
                                                    {/each}
                                                    <div style="margin-top: 0.45rem; font-size: 0.95rem; font-weight: 800; color: var(--matcha-dark);">
                                                        ยอดรวม: {order.totalPrice} บาท
                                                    </div>
                                                </div>

                                                {#if order.slipImage}
                                                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                                                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                                                    <div 
                                                        onclick={() => (selectedSlip = order.slipImage || null)}
                                                        style="cursor: pointer; position: relative; border-radius: 8px; overflow: hidden; border: 1.5px solid #cbd5e1; width: 68px; height: 80px;"
                                                        title="คลิกเพื่อดูสลิป"
                                                    >
                                                        <img src={order.slipImage} alt="Slip" style="width: 100%; height: 100%; object-fit: cover;" />
                                                    </div>
                                                {/if}
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
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
            <div class="form-card admin-calendar-card">
                <div class="admin-calendar-header-box">
                    <div>
                        <h3 class="admin-calendar-title">
                            📅 ปฏิทินเปิดร้านรายเดือน ({thaiMonthNames[currentCalMonth]} {currentCalYear + 543})
                        </h3>
                        <p class="admin-calendar-desc">
                            คลิกที่วันเพื่อเปลี่ยนโหมด หรือกด ⚙️ เพื่อเลือกโหมดทันที
                        </p>
                    </div>
                    <div class="admin-calendar-month-btns">
                        <button 
                            type="button" 
                            onclick={() => (calendarDate = new Date(currentCalYear, currentCalMonth - 1, 1))}
                            class="btn-matcha-outline cal-nav-btn"
                        >
                            ◀ เดือนก่อนหน้า
                        </button>
                        <button 
                            type="button" 
                            onclick={() => (calendarDate = new Date(currentCalYear, currentCalMonth + 1, 1))}
                            class="btn-matcha-outline cal-nav-btn"
                        >
                            เดือนถัดไป ▶
                        </button>
                    </div>
                </div>

                <!-- แถบอธิบายสีสถานะ (Legend) -->
                <div class="admin-calendar-legend">
                    <span style="color: #475569; font-weight: 700;">🎨 โหมด:</span>
                    <span class="legend-chip both">
                        <span class="legend-dot" style="background: #22c55e;"></span>
                        เช้า+บ่าย
                    </span>
                    <span class="legend-chip morning">
                        <span class="legend-dot" style="background: #3b82f6;"></span>
                        🌅 แค่เช้า
                    </span>
                    <span class="legend-chip noon">
                        <span class="legend-dot" style="background: #f59e0b;"></span>
                        ☀️ แค่บ่าย
                    </span>
                    {#if settings.deliveryRounds.some(r => r.id === 'allday' || r.isAllDayOpen)}
                        <span class="legend-chip allday">
                            <span class="legend-dot" style="background: #8b5cf6;"></span>
                            🌿 รวบสาย-บ่าย
                        </span>
                    {/if}
                    <span class="legend-chip closed">
                        <span class="legend-dot" style="background: #cbd5e1;"></span>
                        ⚪ ปิด
                    </span>
                    <span class="legend-tip">
                        💡 คลิกที่ช่องเพื่อสลับโหมด หรือกด ⚙️ เพื่อเลือก
                    </span>
                </div>

                <!-- หัววันในสัปดาห์ (อาทิตย์ - เสาร์) -->
                <div class="admin-calendar-week-headers">
                    <div style="color: #ef4444;">อา.</div>
                    <div style="color: #eab308;">จ.</div>
                    <div style="color: #ec4899;">อ.</div>
                    <div style="color: #16a34a;">พ.</div>
                    <div style="color: #f97316;">พฤ.</div>
                    <div style="color: #0ea5e9;">ศ.</div>
                    <div style="color: #8b5cf6;">ส.</div>
                </div>

                <!-- Grid ช่องวันในเดือน -->
                <div class="admin-calendar-grid">
                    {#each getCalendarMonthGrid(currentCalYear, currentCalMonth) as day}
                        {@const dayConfig = settings.calendar[day.dateStr] || { isOpen: false }}
                        {@const isOpen = Boolean(dayConfig.isOpen)}
                        {@const rounds = dayConfig.customRounds || []}
                        {@const isAllDay = isOpen && rounds.includes('allday')}
                        {@const isMorningOnly = isOpen && rounds.length === 1 && rounds.includes('morning')}
                        {@const isNoonOnly = isOpen && rounds.length === 1 && rounds.includes('noon')}
                        {@const isBothRounds = isOpen && !isAllDay && !isMorningOnly && !isNoonOnly}
                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <div 
                            class="admin-calendar-cell {isBothRounds ? 'is-both' : isMorningOnly ? 'is-morning' : isNoonOnly ? 'is-noon' : isAllDay ? 'is-allday' : 'is-closed'} {!day.isCurrentMonth ? 'not-current-month' : ''}"
                            onclick={() => cycleDayRounds(day.dateStr)}
                            title="คลิกเพื่อสลับโหมดรอบส่ง (ปิด ➔ เช้า+บ่าย ➔ แค่เช้า ➔ แค่บ่าย ➔ ปิด)"
                        >
                            <div class="admin-cal-cell-head">
                                <span class="admin-cal-day-num">
                                    {day.dayNum}
                                </span>
                                <!-- svelte-ignore a11y_click_events_have_key_events -->
                                <!-- svelte-ignore a11y_no_static_element_interactions -->
                                <button 
                                    type="button" 
                                    class="admin-cal-gear-btn"
                                    onclick={(e) => { e.stopPropagation(); openEditDayModal(day.dateStr); }}
                                    title="ตั้งค่ารอบส่งเฉพาะวัน"
                                >
                                    ⚙️
                                </button>
                            </div>

                            <div class="admin-cal-cell-badge">
                                {#if isBothRounds}
                                    <span class="cal-badge both">เช้า+บ่าย</span>
                                {:else if isMorningOnly}
                                    <span class="cal-badge morning">🌅 เช้า</span>
                                {:else if isNoonOnly}
                                    <span class="cal-badge noon">☀️ บ่าย</span>
                                {:else if isAllDay}
                                    <span class="cal-badge allday">9-13น.</span>
                                {:else}
                                    <span class="cal-badge closed">ปิด</span>
                                {/if}
                            </div>
                        </div>
                    {/each}
                </div>
            </div>

            <!-- 3. เบอร์โทรศัพท์แอดมินที่ได้รับสิทธิ์ (Admin Phone Numbers) -->
            <div class="form-card" style="padding: 1.5rem; text-align: left; background: #ffffff; border: 1.5px solid var(--border-matcha); border-radius: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 0.75rem;">
                    <div>
                        <h3 style="margin: 0 0 0.25rem 0; font-size: 1.25rem; color: var(--matcha-deep);">
                            👑 เบอร์โทรศัพท์แอดมินที่ได้รับสิทธิ์ (Admin Phone Numbers)
                        </h3>
                        <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted); line-height: 1.45;">
                            กำหนดเบอร์สมาชิกที่จะมองเห็นแถบ Admin ในหน้าเว็บ และมีปุ่มเข้าหน้าจัดการร้านในหน้า Profile (คั่นด้วยจุลภาค <code>,</code>)
                        </p>
                    </div>
                </div>

                <div style="margin-top: 0.75rem;">
                    <label for="adminAccessPhones" style="font-size: 0.85rem; font-weight: 700; color: #1e293b; display: block; margin-bottom: 0.35rem;">
                        เบอร์โทรศัพท์แอดมิน (สามารถลงทะเบียนเพิ่มได้หลายเบอร์):
                    </label>
                    <input
                        id="adminAccessPhones"
                        type="text"
                        class="form-input"
                        bind:value={settings.lineOa.adminPhone}
                        placeholder="เช่น 0641163533, 0966514809"
                        style="font-weight: 700; font-size: 0.95rem; letter-spacing: 0.3px;"
                    />
                    <p style="margin: 0.35rem 0 0 0; font-size: 0.78rem; color: #64748b;">
                        💡 เบอร์ที่ระบุที่นี่จะได้รับสิทธิ์มองเห็นแถบ Admin ในหน้าเว็บ, มีปุ่ม Admin ในโปรไฟล์ และใช้รับแจ้งเตือนออเดอร์ใน LINE ด้วยค่ะ
                    </p>
                </div>
            </div>

            <!-- 4. ตั้งค่าระยะเวลาการสั่งล่วงหน้า (Max Advance Booking) & ปิดร้านอัตโนมัติ -->
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

            <!-- 7. ระบบแจ้งเตือนลูกค้า (Customer Notification Settings) -->
            <div class="form-card" style="padding: 1.5rem; text-align: left; border: 1.5px solid #86efac; background: #f0fdf4;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.25rem;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <span style="font-size: 1.35rem;">🔔</span>
                            <h3 style="margin: 0; font-size: 1.2rem; color: #14532d; font-weight: 800;">
                                ระบบแจ้งเตือนสถานะลูกค้า (Customer Notifications)
                            </h3>
                        </div>
                        <p style="margin: 0.25rem 0 0 0; font-size: 0.85rem; color: #166534;">
                            เลือกเหตุการณ์และช่องทางที่ต้องการแจ้งเตือนลูกค้าเมื่อสถานะออเดอร์มีการเปลี่ยนแปลง
                        </p>
                    </div>

                    <!-- สวิตช์หลักเปิด/ปิดระบบแจ้งเตือน -->
                    <label style="display: inline-flex; align-items: center; gap: 0.5rem; cursor: pointer; background: #ffffff; padding: 0.4rem 0.85rem; border-radius: 999px; border: 1.5px solid #86efac; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                        <input
                            type="checkbox"
                            bind:checked={settings.notifications.enabled}
                            style="width: 20px; height: 20px; accent-color: #15803d; cursor: pointer;"
                        />
                        <span style="font-size: 0.88rem; font-weight: 800; color: {settings.notifications.enabled ? '#15803d' : '#64748b'};">
                            {settings.notifications.enabled ? '🟢 เปิดใช้งานระบบแจ้งเตือน' : '⚪ ปิดระบบแจ้งเตือน'}
                        </span>
                    </label>
                </div>

                {#if settings.notifications.enabled}
                    <!-- กล่องเลือกเหตุการณ์ที่จะส่งแจ้งเตือน -->
                    <div style="background: #ffffff; border: 1px solid #bbf7d0; border-radius: 12px; padding: 1.25rem; margin-bottom: 1.25rem;">
                        <h4 style="margin: 0 0 0.75rem 0; font-size: 0.95rem; color: #14532d; font-weight: 800;">
                            📢 1. เลือกเหตุการณ์ที่ต้องการส่งแจ้งเตือนลูกค้า:
                        </h4>
                        <div style="display: flex; flex-direction: column; gap: 0.65rem;">
                            <label style="display: flex; align-items: flex-start; gap: 0.6rem; cursor: pointer;">
                                <input
                                    type="checkbox"
                                    bind:checked={settings.notifications.notifyOnSlipApproved}
                                    style="margin-top: 0.2rem; width: 18px; height: 18px; accent-color: #15803d;"
                                />
                                <div>
                                    <strong style="font-size: 0.9rem; color: #1e293b;">
                                        ตรวจสลิปเรียบร้อย / ได้รับยอดชำระแล้ว (เมื่อกดยืนยันตรวจสลิป)
                                    </strong>
                                    <div style="font-size: 0.8rem; color: #64748b;">
                                        แจ้งเตือนเมื่อแอดมินกดยืนยันรับยอดเงิน หลังลูกค้ากดขอให้แอดมินตรวจสอบสลิปด้วยตนเอง
                                    </div>
                                </div>
                            </label>

                            <label style="display: flex; align-items: flex-start; gap: 0.6rem; cursor: pointer;">
                                <input
                                    type="checkbox"
                                    bind:checked={settings.notifications.notifyOnDelivering}
                                    style="margin-top: 0.2rem; width: 18px; height: 18px; accent-color: #15803d;"
                                />
                                <div>
                                    <strong style="font-size: 0.9rem; color: #1e293b;">
                                        กำลังออกจัดส่ง 🛵 (เมื่อเปลี่ยนสถานะเป็น 'delivering')
                                    </strong>
                                    <div style="font-size: 0.8rem; color: #64748b;">
                                        แจ้งเตือนลูกค้าให้เตรียมรับเครื่องดื่มมัทฉะสดชงใหม่
                                    </div>
                                </div>
                            </label>

                            <label style="display: flex; align-items: flex-start; gap: 0.6rem; cursor: pointer;">
                                <input
                                    type="checkbox"
                                    bind:checked={settings.notifications.notifyOnCompleted}
                                    style="margin-top: 0.2rem; width: 18px; height: 18px; accent-color: #15803d;"
                                />
                                <div>
                                    <strong style="font-size: 0.9rem; color: #1e293b;">
                                        จัดส่งสำเร็จเรียบร้อย ✨ (เมื่อกดส่งมอบสำเร็จจากการ์ดส่ง)
                                    </strong>
                                    <div style="font-size: 0.8rem; color: #64748b;">
                                        แจ้งเตือนลูกค้าว่านำเครื่องดื่มไปส่งมอบถึงที่หมายเรียบร้อยแล้ว
                                    </div>
                                </div>
                            </label>
                        </div>
                    </div>

                    <!-- กล่องเลือกช่องทางจัดส่งแจ้งเตือน -->
                    <div style="background: #ffffff; border: 1px solid #bbf7d0; border-radius: 12px; padding: 1.25rem; margin-bottom: 1.25rem;">
                        <h4 style="margin: 0 0 0.75rem 0; font-size: 0.95rem; color: #14532d; font-weight: 800;">
                            📡 2. ช่องทางการส่งข้อความแจ้งเตือน:
                        </h4>
                        <div style="display: flex; flex-direction: column; gap: 0.85rem;">
                            <!-- LINE OA 100% Notice -->
                            <div style="background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 10px; padding: 0.95rem 1.15rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
                                <div>
                                    <strong style="font-size: 0.95rem; color: #166534; display: flex; align-items: center; gap: 0.45rem;">
                                        <img src="/image/line-logo.png" alt="LINE" style="width: 22px; height: 22px; border-radius: 5px; flex-shrink: 0; object-fit: contain;" />
                                        ระบบแจ้งเตือนหลัก: ใช้ LINE Official Account 100%
                                    </strong>
                                    <div style="font-size: 0.82rem; color: #15803d; margin-top: 0.25rem; line-height: 1.4;">
                                        ระบบส่งการแจ้งเตือนสถานะออเดอร์และการ์ด Flex Message หาแอดมินและลูกค้าผ่าน LINE OA ทั้งหมดโดยตรง (ยกเลิก Web Push แล้ว)
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onclick={() => { activeTab = 'line_oa'; loadLineUsers(); }}
                                    style="padding: 0.5rem 1rem; background: #06c755; color: #ffffff; border: none; border-radius: 8px; font-weight: 700; font-size: 0.85rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem;"
                                >
                                    💬 จัดการ LINE OA & Card Designer
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- กล่องทดสอบส่งการแจ้งเตือน (Test Box) -->
                    <div style="background: #ffffff; border: 1.5px dashed #86efac; border-radius: 12px; padding: 1.25rem;">
                        <h4 style="margin: 0 0 0.5rem 0; font-size: 0.95rem; color: #14532d; font-weight: 800;">
                            🧪 3. ทดสอบส่งข้อความแจ้งเตือน:
                        </h4>
                        <p style="margin: 0 0 0.75rem 0; font-size: 0.82rem; color: #64748b;">
                            ระบุเบอร์โทรศัพท์ของเครื่องที่ได้กดเปิดรับการแจ้งเตือนไว้ เพื่อทดสอบยิง Push Notification ทันที
                        </p>
                        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                            <input
                                type="tel"
                                bind:value={testNotifPhone}
                                placeholder="เช่น 0812345678"
                                maxlength={12}
                                style="flex: 1; min-width: 200px; padding: 0.5rem 0.75rem; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 0.88rem;"
                            />
                            <button
                                type="button"
                                onclick={sendTestNotification}
                                disabled={isSendingTestNotif}
                                style="padding: 0.5rem 1.1rem; background: #0284c7; color: #ffffff; border: none; border-radius: 8px; font-weight: 700; font-size: 0.88rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem;"
                            >
                                {#if isSendingTestNotif}
                                    <span>⏳ กำลังทดสอบส่ง...</span>
                                {:else}
                                    <span>🚀 ทดสอบส่งแจ้งเตือน</span>
                                {/if}
                            </button>
                        </div>
                    </div>
                {/if}
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

    <!-- ============================================== -->
    <!-- 💬 TAB: ระบบจัดการ LINE Official Account (LINE OA) -->
    <!-- ============================================== -->
    {#if activeTab === 'line_oa'}
        <div style="display: flex; flex-direction: column; gap: 1.5rem; text-align: left;">
            <!-- Header Card & Master Toggle -->
            <div class="info-card" style="padding: 1.5rem; border: 2px solid #86efac; background: linear-gradient(to bottom right, #f0fdf4, #ffffff);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem;">
                            <span style="background: #06c755; color: #fff; padding: 0.2rem 0.65rem; border-radius: 999px; font-size: 0.82rem; font-weight: 800; display: inline-flex; align-items: center; gap: 0.35rem;">
                                💬 LINE Messaging API
                            </span>
                            <span style="font-size: 0.8rem; background: {settings.lineOa.enabled ? '#dcfce7' : '#fee2e2'}; color: {settings.lineOa.enabled ? '#166534' : '#991b1b'}; padding: 0.15rem 0.6rem; border-radius: 999px; font-weight: 700;">
                                {settings.lineOa.enabled ? '● เปิดใช้งานระบบ' : '○ ปิดการทำงาน'}
                            </span>
                        </div>
                        <h2 style="margin: 0 0 0.35rem 0; font-size: 1.35rem; font-weight: 800; color: #166534;">
                            ตั้งค่า &amp; จัดการระบบ LINE Official Account
                        </h2>
                        <p style="margin: 0; font-size: 0.88rem; color: #475569;">
                            เชื่อมต่อ LINE Messaging API, ตั้งค่าข้อความตอบกลับอัตโนมัติ (Auto-Replies), จัดการคีย์เวิร์ด และการแจ้งเตือนสถานะออเดอร์
                        </p>
                    </div>

                    <label style="display: inline-flex; align-items: center; gap: 0.6rem; cursor: pointer; background: #ffffff; padding: 0.6rem 1rem; border-radius: 999px; border: 1.5px solid #86efac; box-shadow: 0 2px 6px rgba(0,0,0,0.04);">
                        <input
                            type="checkbox"
                            bind:checked={settings.lineOa.enabled}
                            style="width: 20px; height: 20px; accent-color: #06c755;"
                        />
                        <span style="font-size: 0.92rem; font-weight: 800; color: {settings.lineOa.enabled ? '#166534' : '#64748b'};">
                            {settings.lineOa.enabled ? 'เปิดระบบ LINE OA' : 'ปิดระบบ LINE OA'}
                        </span>
                    </label>
                </div>
            </div>

            <!-- 📱 Sub-Navigation Bar สำหรับจัดหมวดหมู่ LINE OA -->
            <div class="line-subtabs-bar">
                <button
                    type="button"
                    class="line-subtab-btn {lineOaSubTab === 'connection' ? 'active' : ''}"
                    onclick={() => (lineOaSubTab = 'connection')}
                >
                    <span class="subtab-icon">🔗</span>
                    <span class="subtab-label">เชื่อมต่อ &amp; แอดมิน</span>
                </button>
                <button
                    type="button"
                    class="line-subtab-btn {lineOaSubTab === 'notifications' ? 'active' : ''}"
                    onclick={() => (lineOaSubTab = 'notifications')}
                >
                    <span class="subtab-icon">🔔</span>
                    <span class="subtab-label">แจ้งเตือนสถานะ</span>
                </button>
                <button
                    type="button"
                    class="line-subtab-btn {lineOaSubTab === 'bot' ? 'active' : ''}"
                    onclick={() => (lineOaSubTab = 'bot')}
                >
                    <span class="subtab-icon">🤖</span>
                    <span class="subtab-label">ตอบกลับ &amp; คีย์เวิร์ด</span>
                </button>
                <button
                    type="button"
                    class="line-subtab-btn {lineOaSubTab === 'designer' ? 'active' : ''}"
                    onclick={() => (lineOaSubTab = 'designer')}
                >
                    <span class="subtab-icon">🎨</span>
                    <span class="subtab-label">ออกแบบการ์ด</span>
                </button>
                <button
                    type="button"
                    class="line-subtab-btn {lineOaSubTab === 'users' ? 'active' : ''}"
                    onclick={() => (lineOaSubTab = 'users')}
                >
                    <span class="subtab-icon">👥</span>
                    <span class="subtab-label">สมาชิก &amp; ริชเมนู</span>
                </button>
            </div>

            <!-- 1. หมวด: เชื่อมต่อ & แอดมิน -->
            {#if lineOaSubTab === 'connection'}
                <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                    <!-- กล่องที่ 1: กุญแจ API & การเชื่อมต่อ Webhook -->
            <div class="info-card" style="padding: 1.5rem; background: #ffffff; border: 1px solid #cbd5e1;">
                <h3 style="margin: 0 0 0.25rem 0; font-size: 1.15rem; color: #14532d; font-weight: 800;">
                    🔑 1. ข้อมูลการเชื่อมต่อ LINE Developers Console
                </h3>
                <p style="margin: 0 0 1.25rem 0; font-size: 0.85rem; color: #64748b;">
                    ระบุ Channel Secret, Channel Access Token และนำ Webhook URL ไปใส่ใน LINE Developers Console
                </p>

                <!-- Webhook URL Display Box -->
                <div style="background: #f8fafc; border: 1.5px dashed #0284c7; border-radius: 12px; padding: 1.1rem; margin-bottom: 1.25rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <span style="font-weight: 800; font-size: 0.88rem; color: #0369a1; display: inline-flex; align-items: center; gap: 0.35rem;">
                            🌐 Webhook URL สำหรับใส่ใน LINE Console:
                        </span>
                        <span style="font-size: 0.75rem; background: #e0f2fe; color: #0369a1; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 6px;">
                            POST /api/line/webhook
                        </span>
                    </div>

                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        <input
                            type="text"
                            readonly
                            value="https://homematchacafe.store/api/line/webhook"
                            style="flex: 1; min-width: 0; width: 100%; padding: 0.6rem 0.85rem; background: #ffffff; border: 1.5px solid #94a3b8; border-radius: 8px; font-family: monospace; font-size: 0.92rem; color: #0f172a; font-weight: 600;"
                        />
                        <button
                            type="button"
                            onclick={copyWebhookUrl}
                            style="padding: 0.6rem 1.25rem; background: {webhookCopied ? '#16a34a' : '#0284c7'}; color: #ffffff; border: none; border-radius: 8px; font-weight: 800; font-size: 0.88rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem; transition: background 0.2s ease;"
                        >
                            {webhookCopied ? '✓ คัดลอกแล้ว!' : '📋 คัดลอก Webhook URL'}
                        </button>
                    </div>

                    <div style="margin-top: 0.85rem; padding-top: 0.75rem; border-top: 1px solid #e2e8f0; font-size: 0.8rem; color: #475569; line-height: 1.6;">
                        <strong style="color: #0369a1;">📌 วิธีการตั้งค่าใน LINE Developers Console:</strong><br/>
                        1. ไปที่ <a href="https://developers.line.biz" target="_blank" rel="noopener noreferrer" style="color: #0284c7; font-weight: 700; text-decoration: underline;">LINE Developers Console</a> &gt; เข้าเมนู Channel มัทฉะของคุณ<br/>
                        2. ไปที่แท็บ <strong>Messaging API</strong> &gt; เลื่อนหาหัวข้อ <strong>Webhook settings</strong><br/>
                        3. กด <strong>Edit</strong> แล้ววาง Webhook URL ด้านบน &gt; กด <strong>Verify</strong> (ต้องขึ้น Verified)<br/>
                        4. เปิดสวิตช์ <strong>Use webhook</strong> ให้เป็นสีเขียว
                    </div>
                </div>

                <!-- API Credentials Grid -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
                    <!-- Channel Secret -->
                    <div>
                        <label for="lineChannelSecret" style="display: block; font-size: 0.85rem; font-weight: 700; color: #1e293b; margin-bottom: 0.35rem;">
                            Channel Secret:
                        </label>
                        <input
                            id="lineChannelSecret"
                            type="text"
                            bind:value={settings.lineOa.channelSecret}
                            placeholder="เช่น ae1cf62ef3dbe63af73e93dd4b946bb1"
                            style="width: 100%; padding: 0.6rem 0.8rem; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 0.88rem; font-family: monospace;"
                        />
                        <span style="font-size: 0.75rem; color: #64748b;">จากแท็บ Basic settings ใช้สำหรับยืนยันความปลอดภัยของ Webhook</span>
                    </div>

                    <!-- Bot Basic ID -->
                    <div>
                        <label for="lineBotBasicId" style="display: block; font-size: 0.85rem; font-weight: 700; color: #1e293b; margin-bottom: 0.35rem;">
                            Bot Basic ID:
                        </label>
                        <input
                            id="lineBotBasicId"
                            type="text"
                            bind:value={settings.lineOa.botBasicId}
                            placeholder="เช่น @719wvlgi"
                            style="width: 100%; padding: 0.6rem 0.8rem; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 0.88rem; font-weight: 600;"
                        />
                        <span style="font-size: 0.75rem; color: #64748b;">ไอดี LINE OA สำหรับให้ลูกค้าแอดเพื่อน</span>
                    </div>

                    <!-- Admin User ID -->
                    <div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                            <label for="lineAdminUserId" style="font-size: 0.85rem; font-weight: 700; color: #1e293b; margin: 0;">
                                🆔 Admin User ID (รองรับหลายคน คั่นด้วยจุลภาค ,):
                            </label>
                            {#if settings.lineOa.adminLineUserId}
                                <button
                                    type="button"
                                    onclick={() => copyToClipboard(settings.lineOa.adminLineUserId, 'คัดลอก Admin LINE ID แล้ว 📋')}
                                    style="background: none; border: none; color: #0284c7; font-size: 0.75rem; font-weight: 700; cursor: pointer; text-decoration: underline;"
                                >
                                    📋 คัดลอก ID
                                </button>
                            {/if}
                        </div>
                        <input
                            id="lineAdminUserId"
                            type="text"
                            bind:value={settings.lineOa.adminLineUserId}
                            placeholder="เช่น U123..., U456... (คั่นด้วยจุลภาค , เมื่อมีแอดมินหลายคน)"
                            style="width: 100%; padding: 0.6rem 0.8rem; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 0.88rem; font-family: monospace;"
                        />
                        <span style="font-size: 0.75rem; color: #64748b;">ดูได้จาก "Your user ID" ที่ด้านล่างของแท็บ Basic settings ใน LINE Developers Console</span>
                    </div>

                    <!-- เบอร์โทรศัพท์แอดมิน (Admin Phone Number) -->
                    <div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                            <label for="lineAdminPhone" style="font-size: 0.85rem; font-weight: 700; color: #1e293b; margin: 0;">
                                📱 เบอร์โทรศัพท์แอดมิน (รองรับหลายคน คั่นด้วยจุลภาค ,):
                            </label>
                            {#if settings.lineOa.adminPhone}
                                <button
                                    type="button"
                                    onclick={() => copyToClipboard(settings.lineOa.adminPhone, 'คัดลอกเบอร์แอดมินแล้ว 📋')}
                                    style="background: none; border: none; color: #0284c7; font-size: 0.75rem; font-weight: 700; cursor: pointer; text-decoration: underline;"
                                >
                                    📋 คัดลอกเบอร์
                                </button>
                            {/if}
                        </div>
                        <input
                            id="lineAdminPhone"
                            type="text"
                            bind:value={settings.lineOa.adminPhone}
                            placeholder="เช่น 0812345678, 0898765432"
                            style="width: 100%; padding: 0.6rem 0.8rem; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 0.88rem; font-weight: 600;"
                        />
                        <div style="font-size: 0.75rem; color: #64748b; margin-top: 0.25rem;">
                            ใส่เบอร์โทรศัพท์แอดมินได้มากกว่า 1 คน โดยคั่นด้วยเครื่องหมายจุลภาค <code>,</code> ระบบจะค้นหาบัญชี LINE ที่ผูกกับแต่ละเบอร์ และส่งแจ้งเตือนออเดอร์ใหม่ / สลิปโอนเงิน / การทดสอบ ไปยังแอดมินทุกคนพร้อมกันทันทีค่ะ
                        </div>

                        {#if settings.lineOa.adminPhone}
                            {@const parsedAdminPhones = settings.lineOa.adminPhone.split(/[,;\s\n]+/).map(p => p.trim()).filter(Boolean)}
                            {#if parsedAdminPhones.length > 0}
                                <div style="display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.45rem;">
                                    {#each parsedAdminPhones as ph}
                                        {@const cleanPh = ph.replace(/[^0-9]/g, '')}
                                        {@const linked = lineUsersList.find(u => u.phone && u.phone.replace(/[^0-9]/g, '') === cleanPh)}
                                        <span style="display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.2rem 0.55rem; background: {linked ? '#dcfce7' : '#fee2e2'}; border: 1px solid {linked ? '#86efac' : '#fca5a5'}; border-radius: 999px; font-size: 0.74rem; font-weight: 700; color: {linked ? '#166534' : '#991b1b'};">
                                            {linked ? '🟢 ผูกแล้ว' : '⚪ ยังไม่ผูก'}: {ph}
                                            {#if linked?.display_name}
                                                <small style="opacity: 0.85;">({linked.display_name})</small>
                                            {/if}
                                        </span>
                                    {/each}
                                </div>
                            {/if}
                        {/if}
                    </div>

                    <!-- Channel Access Token (Long-lived) -->
                    <div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                            <label for="lineChannelToken" style="font-size: 0.85rem; font-weight: 700; color: #1e293b;">
                                Channel Access Token (Long-lived):
                            </label>
                            <button
                                type="button"
                                onclick={() => (isLineTokenVisible = !isLineTokenVisible)}
                                style="background: none; border: none; color: #0284c7; font-size: 0.75rem; font-weight: 700; cursor: pointer; text-decoration: underline;"
                            >
                                {isLineTokenVisible ? 'ซ่อน Token' : 'แสดง Token'}
                            </button>
                        </div>
                        <input
                            id="lineChannelToken"
                            type={isLineTokenVisible ? 'text' : 'password'}
                            bind:value={settings.lineOa.channelAccessToken}
                            placeholder="วาง Channel Access Token ยาวๆ จากแท็บ Messaging API"
                            style="width: 100%; padding: 0.6rem 0.8rem; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 0.88rem; font-family: monospace;"
                        />
                        <span style="font-size: 0.75rem; color: #64748b;">กดปุ่ม Issue ในแท็บ Messaging API &gt; Channel access token</span>
                    </div>
                </div>
            </div>
                    <!-- กล่องที่ 3: แจ้งเตือนแอดมิน & ทดสอบส่งข้อความ -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem;">
                <!-- แจ้งเตือนแอดมิน -->
                <div class="info-card" style="padding: 1.5rem; background: #ffffff; border: 1px solid #cbd5e1;">
                    <h3 style="margin: 0 0 0.25rem 0; font-size: 1.1rem; color: #14532d; font-weight: 800;">
                        🚨 3. แจ้งเตือนแอดมินทาง LINE
                    </h3>
                    <p style="margin: 0 0 1rem 0; font-size: 0.82rem; color: #64748b;">
                        ส่งแจ้งเตือนตรงเข้า LINE ส่วนตัวของแอดมิน ({settings.lineOa.adminLineUserId || 'ยังไม่ได้ระบุ'})
                    </p>

                    <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                        <label style="display: flex; align-items: center; gap: 0.6rem; cursor: pointer; padding: 0.7rem; border-radius: 8px; background: #f8fafc; border: 1px solid #e2e8f0;">
                            <input
                                type="checkbox"
                                bind:checked={settings.lineOa.notifyAdminOnNewOrder}
                                style="width: 18px; height: 18px; accent-color: #166534;"
                            />
                            <div>
                                <strong style="font-size: 0.88rem; color: #1e293b;">🔔 แจ้งเตือนเมื่อมีออเดอร์ใหม่</strong>
                                <div style="font-size: 0.78rem; color: #64748b;">ส่งรายละเอียดคำสั่งซื้อ ยอดชำระ และรอบส่ง</div>
                            </div>
                        </label>

                        <label style="display: flex; align-items: center; gap: 0.6rem; cursor: pointer; padding: 0.7rem; border-radius: 8px; background: #f8fafc; border: 1px solid #e2e8f0;">
                            <input
                                type="checkbox"
                                bind:checked={settings.lineOa.notifyAdminOnSlipUploaded}
                                style="width: 18px; height: 18px; accent-color: #166534;"
                            />
                            <div>
                                <strong style="font-size: 0.88rem; color: #1e293b;">💳 แจ้งเตือนเมื่อมีสลิปแนบใหม่</strong>
                                <div style="font-size: 0.78rem; color: #64748b;">แจ้งเตือนแอดมินให้รีบตรวจสลิปและรับยอดเงิน</div>
                            </div>
                        </label>
                    </div>
                </div>

                <!-- ทดสอบส่งข้อความ Push Test -->
                <div class="info-card" style="padding: 1.5rem; background: #ffffff; border: 1.5px dashed #86efac;">
                    <h3 style="margin: 0 0 0.25rem 0; font-size: 1.1rem; color: #14532d; font-weight: 800;">
                        🧪 4. ทดสอบส่งข้อความ LINE Push
                    </h3>
                    <p style="margin: 0 0 0.85rem 0; font-size: 0.82rem; color: #64748b;">
                        ทดสอบยิงข้อความ Flex Message ไปยัง LINE แอดมินทันที เพื่อยืนยันว่า Access Token ถูกต้อง
                    </p>

                    <!-- ปุ่มเทสส่งการ์ดแจ้งเตือนสถานะต่างๆ -->
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 0.75rem; margin-bottom: 0.75rem;">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.45rem; flex-wrap: wrap; gap: 0.25rem;">
                            <strong style="font-size: 0.82rem; color: #1e293b;">⚡ ทดสอบยิงการ์ดสถานะเข้า LINE แอดมิน:</strong>
                            <span style="font-size: 0.7rem; color: #64748b;">(ยิงเข้าบัญชีที่ระบุไว้)</span>
                        </div>
                        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(105px, 1fr)); gap: 0.35rem;">
                            <button
                                type="button"
                                disabled={isSendingLineTest}
                                onclick={() => sendLineTestPushMessage('brewing')}
                                style="padding: 0.35rem 0.45rem; font-size: 0.74rem; font-weight: 700; background: #f0fdfa; border: 1px solid #14b8a6; color: #0f766e; border-radius: 6px; cursor: pointer;"
                                title="ยิงการ์ดทดสอบสถานะ: กำลังชง เข้า LINE แอดมิน"
                            >
                                🍵 กำลังชง
                            </button>
                            <button
                                type="button"
                                disabled={isSendingLineTest}
                                onclick={() => sendLineTestPushMessage('ready_to_ship')}
                                style="padding: 0.35rem 0.45rem; font-size: 0.74rem; font-weight: 700; background: #ecfdf5; border: 1px solid #10b981; color: #065f46; border-radius: 6px; cursor: pointer;"
                                title="ยิงการ์ดทดสอบสถานะ: ชงเสร็จพร้อมส่ง เข้า LINE แอดมิน"
                            >
                                ✨ ชงเสร็จ
                            </button>
                            <button
                                type="button"
                                disabled={isSendingLineTest}
                                onclick={() => sendLineTestPushMessage('delivering')}
                                style="padding: 0.35rem 0.45rem; font-size: 0.74rem; font-weight: 700; background: #f0f9ff; border: 1px solid #38bdf8; color: #0284c7; border-radius: 6px; cursor: pointer;"
                                title="ยิงการ์ดทดสอบสถานะ: กำลังนำส่ง เข้า LINE แอดมิน"
                            >
                                🛵 กำลังส่ง
                            </button>
                            <button
                                type="button"
                                disabled={isSendingLineTest}
                                onclick={() => sendLineTestPushMessage('completed')}
                                style="padding: 0.35rem 0.45rem; font-size: 0.74rem; font-weight: 700; background: #f0fdf4; border: 1px solid #22c55e; color: #15803d; border-radius: 6px; cursor: pointer;"
                                title="ยิงการ์ดทดสอบสถานะ: จัดส่งสำเร็จ เข้า LINE แอดมิน"
                            >
                                🎉 ส่งสำเร็จ
                            </button>
                            <button
                                type="button"
                                disabled={isSendingLineTest}
                                onclick={() => sendLineTestPushMessage('cancelled')}
                                style="padding: 0.35rem 0.45rem; font-size: 0.74rem; font-weight: 700; background: #fef2f2; border: 1px solid #f87171; color: #991b1b; border-radius: 6px; cursor: pointer;"
                                title="ยิงการ์ดทดสอบสถานะ: ยกเลิก เข้า LINE แอดมิน"
                            >
                                ❌ ยกเลิก
                            </button>
                            <button
                                type="button"
                                disabled={isSendingLineTest}
                                onclick={() => sendLineTestPushMessage('order_created')}
                                style="padding: 0.35rem 0.45rem; font-size: 0.74rem; font-weight: 700; background: #f8fafc; border: 1px solid #94a3b8; color: #334155; border-radius: 6px; cursor: pointer;"
                                title="ยิงการ์ดทดสอบสถานะ: รับออเดอร์ใหม่ เข้า LINE แอดมิน"
                            >
                                📝 รับออเดอร์
                            </button>
                            <button
                                type="button"
                                disabled={isSendingLineTest}
                                onclick={() => sendLineTestPushMessage('slip_approved')}
                                style="padding: 0.35rem 0.45rem; font-size: 0.74rem; font-weight: 700; background: #f0fdf4; border: 1px solid #86efac; color: #166534; border-radius: 6px; cursor: pointer;"
                                title="ยิงการ์ดทดสอบสถานะ: ตรวจสอบสลิปผ่าน เข้า LINE แอดมิน"
                            >
                                💳 อนุมัติสลิป
                            </button>
                            <button
                                type="button"
                                disabled={isSendingLineTest}
                                onclick={() => sendLineTestPushMessage('member_registered')}
                                style="padding: 0.35rem 0.45rem; font-size: 0.74rem; font-weight: 700; background: #fdf2f8; border: 1px solid #f472b6; color: #9d174d; border-radius: 6px; cursor: pointer;"
                                title="ยิงการ์ดทดสอบสถานะ: ลูกค้าสมัครสมาชิกสำเร็จ เข้า LINE แอดมิน"
                            >
                                ✨ สมัครสมาชิก
                            </button>
                            <button
                                type="button"
                                disabled={isSendingLineTest}
                                onclick={() => sendLineTestPushMessage('admin_order_paid')}
                                style="padding: 0.35rem 0.55rem; font-size: 0.74rem; font-weight: 700; background: #ecfdf5; border: 1.5px solid #10b981; color: #047857; border-radius: 6px; cursor: pointer;"
                                title="ยิงการ์ดแจ้งเตือนแอดมิน: ออเดอร์รับยอดแล้ว (แสดงรายการเครื่องดื่มที่สั่ง)"
                            >
                                🔔 รับยอดแล้ว (แอดมิน)
                            </button>
                            <button
                                type="button"
                                disabled={isSendingLineTest}
                                onclick={() => sendLineTestPushMessage('admin_slip_uploaded')}
                                style="padding: 0.35rem 0.55rem; font-size: 0.74rem; font-weight: 700; background: #f0f9ff; border: 1.5px solid #0284c7; color: #0369a1; border-radius: 6px; cursor: pointer;"
                                title="ยิงการ์ดแจ้งเตือนแอดมิน: สลิปรอตรวจ (มีปุ่มตรวจสลิป)"
                            >
                                🔍 สลิปรอตรวจ (แอดมิน)
                            </button>
                        </div>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 0.65rem;">
                        <textarea
                            bind:value={lineTestMessageInput}
                            rows={2}
                            placeholder="พิมพ์ข้อความทดสอบทั่วไป..."
                            style="width: 100%; padding: 0.6rem; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 0.85rem; line-height: 1.4;"
                        ></textarea>

                        <button
                            type="button"
                            onclick={() => sendLineTestPushMessage()}
                            disabled={isSendingLineTest}
                            style="padding: 0.65rem 1.25rem; background: #166534; color: #ffffff; border: none; border-radius: 8px; font-weight: 800; font-size: 0.88rem; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;"
                        >
                            {#if isSendingLineTest}
                                <span>⏳ กำลังยิงข้อความ...</span>
                            {:else}
                                <span>🚀 ทดสอบส่งข้อความเข้า LINE แอดมิน</span>
                            {/if}
                        </button>
                    </div>
                </div>
            </div>
                </div>
            {/if}

            <!-- 2. หมวด: แจ้งเตือนสถานะลูกค้า -->
            {#if lineOaSubTab === 'notifications'}
                <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                    <!-- กล่องที่ 2: ตั้งค่าการแจ้งเตือนสถานะคำสั่งซื้อให้ลูกค้า -->
            <div class="info-card" style="padding: 1.5rem; background: #ffffff; border: 1px solid #cbd5e1;">
                <h3 style="margin: 0 0 0.25rem 0; font-size: 1.15rem; color: #14532d; font-weight: 800;">
                    🔔 2. ตั้งค่าการแจ้งเตือนสถานะคำสั่งซื้อให้ลูกค้า
                </h3>
                <p style="margin: 0 0 1.25rem 0; font-size: 0.85rem; color: #64748b;">
                    เลือกว่าต้องการให้ระบบส่งแจ้งเตือน Flex Message ทาง LINE ไปยังลูกค้าในขั้นตอนใดบ้าง
                </p>

                <div class="line-notify-grid" style="display: grid; gap: 0.85rem;">
                    <!-- 1. ได้รับคำสั่งซื้อใหม่ -->
                    <label style="display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.85rem 1rem; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; cursor: pointer;">
                        <input
                            type="checkbox"
                            bind:checked={settings.lineOa.notifyOnOrderCreated}
                            style="margin-top: 0.2rem; width: 18px; height: 18px; accent-color: #166534;"
                        />
                        <div>
                            <strong style="font-size: 0.9rem; color: #1e293b;">🍵 ได้รับคำสั่งซื้อใหม่ (Order Created)</strong>
                            <div style="font-size: 0.8rem; color: #64748b; margin-top: 0.2rem;">
                                ส่งสรุปรายการเครื่องดื่มและยอดรวมเมื่อลูกค้ากดยืนยันสั่งซื้อ
                            </div>
                        </div>
                    </label>

                    <!-- 2. อนุมัติสลิป / รับยอด -->
                    <label style="display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.85rem 1rem; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; cursor: pointer;">
                        <input
                            type="checkbox"
                            bind:checked={settings.lineOa.notifyOnSlipApproved}
                            style="margin-top: 0.2rem; width: 18px; height: 18px; accent-color: #166534;"
                        />
                        <div>
                            <strong style="font-size: 0.9rem; color: #1e293b;">💳 ตรวจสอบสลิป &amp; ยืนยันรับยอดแล้ว</strong>
                            <div style="font-size: 0.8rem; color: #64748b; margin-top: 0.2rem;">
                                แจ้งเตือนเมื่อแอดมินกดตรวจสลิปผ่าน หรือระบบตรวจสอบสลิปสำเร็จ
                            </div>
                        </div>
                    </label>

                    <!-- 3. กำลังชง -->
                    <label style="display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.85rem 1rem; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; cursor: pointer;">
                        <input
                            type="checkbox"
                            bind:checked={settings.lineOa.notifyOnBrewing}
                            style="margin-top: 0.2rem; width: 18px; height: 18px; accent-color: #166534;"
                        />
                        <div>
                            <strong style="font-size: 0.9rem; color: #1e293b;">🍃 บาริสต้าเริ่มชงเครื่องดื่ม</strong>
                            <div style="font-size: 0.8rem; color: #64748b; margin-top: 0.2rem;">
                                แจ้งเตือนเมื่อบาริสต้าเปลี่ยนสถานะเป็น "กำลังชง"
                            </div>
                        </div>
                    </label>

                    <!-- 4. ชงเสร็จแล้ว รอจัดส่ง -->
                    <label style="display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.85rem 1rem; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; cursor: pointer;">
                        <input
                            type="checkbox"
                            bind:checked={settings.lineOa.notifyOnReadyToShip}
                            style="margin-top: 0.2rem; width: 18px; height: 18px; accent-color: #166534;"
                        />
                        <div>
                            <strong style="font-size: 0.9rem; color: #1e293b;">📦 ชงเสร็จแล้ว แพ็กพร้อมส่ง</strong>
                            <div style="font-size: 0.8rem; color: #64748b; margin-top: 0.2rem;">
                                แจ้งเตือนเมื่อเครื่องดื่มพร้อมจัดส่งตามรอบเวลา
                            </div>
                        </div>
                    </label>

                    <!-- 5. กำลังนำส่ง -->
                    <label style="display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.85rem 1rem; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; cursor: pointer;">
                        <input
                            type="checkbox"
                            bind:checked={settings.lineOa.notifyOnDelivering}
                            style="margin-top: 0.2rem; width: 18px; height: 18px; accent-color: #166534;"
                        />
                        <div>
                            <strong style="font-size: 0.9rem; color: #1e293b;">🛵 ไรเดอร์กำลังนำส่งถึงที่</strong>
                            <div style="font-size: 0.8rem; color: #64748b; margin-top: 0.2rem;">
                                แจ้งเตือนให้ลูกค้าเตรียมตัวรับเครื่องดื่ม
                            </div>
                        </div>
                    </label>

                    <!-- 6. จัดส่งสำเร็จ -->
                    <label style="display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.85rem 1rem; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; cursor: pointer;">
                        <input
                            type="checkbox"
                            bind:checked={settings.lineOa.notifyOnCompleted}
                            style="margin-top: 0.2rem; width: 18px; height: 18px; accent-color: #166534;"
                        />
                        <div>
                            <strong style="font-size: 0.9rem; color: #1e293b;">🎉 จัดส่งสำเร็จ &amp; บันทึกแต้มสะสม</strong>
                            <div style="font-size: 0.8rem; color: #64748b; margin-top: 0.2rem;">
                                แจ้งเตือนส่งมอบสำเร็จ พร้อมแสดงแต้มสะสมที่ได้รับ
                            </div>
                        </div>
                    </label>

                    <!-- 7. ยกเลิกออเดอร์ -->
                    <label style="display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.85rem 1rem; border: 1px solid #fee2e2; border-radius: 10px; background: #fff5f5; cursor: pointer;">
                        <input
                            type="checkbox"
                            bind:checked={settings.lineOa.notifyOnCancelled}
                            style="margin-top: 0.2rem; width: 18px; height: 18px; accent-color: #dc2626;"
                        />
                        <div>
                            <strong style="font-size: 0.9rem; color: #991b1b;">❌ ออเดอร์ถูกยกเลิก (Order Cancelled)</strong>
                            <div style="font-size: 0.8rem; color: #64748b; margin-top: 0.2rem;">
                                แจ้งเตือนลูกค้าเมื่อออเดอร์ถูกยกเลิก
                            </div>
                        </div>
                    </label>

                    <!-- 8. ได้รับเบอร์โทรศัพท์จากลูกค้า (Event ได้เบอร์) -->
                    <label style="display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.85rem 1rem; border: 1.5px solid #fbcfe8; border-radius: 10px; background: #fdf2f8; cursor: pointer;">
                        <input
                            type="checkbox"
                            bind:checked={settings.lineOa.notifyOnPhoneLinked}
                            style="margin-top: 0.2rem; width: 18px; height: 18px; accent-color: #be185d;"
                        />
                        <div>
                            <strong style="font-size: 0.9rem; color: #831843;">📱 ได้รับเบอร์โทรศัพท์ (Event ได้เบอร์)</strong>
                            <div style="font-size: 0.8rem; color: #9d174d; margin-top: 0.2rem;">
                                ส่งการ์ดตอบกลับทันที (แจ้งผลเชื่อมต่อบัญชี / การ์ดชวนสมัครสมาชิก) เมื่อลูกค้าพิมพ์เบอร์ 10 หลัก
                            </div>
                        </div>
                    </label>

                    <!-- 9. ลูกค้าสมัครสมาชิกเสร็จแล้ว (Event ลูกค้าสมัครสมาชิก) -->
                    <label style="display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.85rem 1rem; border: 1.5px solid #bbf7d0; border-radius: 10px; background: #f0fdf4; cursor: pointer;">
                        <input
                            type="checkbox"
                            bind:checked={settings.lineOa.notifyOnMemberRegistered}
                            style="margin-top: 0.2rem; width: 18px; height: 18px; accent-color: #166534;"
                        />
                        <div>
                            <strong style="font-size: 0.9rem; color: #166534;">🎉 ลูกค้าสมัครสมาชิกเสร็จแล้ว (Member Registered)</strong>
                            <div style="font-size: 0.8rem; color: #15803d; margin-top: 0.2rem;">
                                แจ้งเตือนลูกค้าทาง LINE ทันทีเมื่อสมัครสมาชิกสำเร็จ (ถ้าผูกเบอร์กับ LINE ไว้ก่อนแล้ว) พร้อมแจ้งรหัส PIN
                            </div>
                        </div>
                    </label>
                </div>
            </div>
                </div>
            {/if}

            <!-- 3. หมวด: บอท & คีย์เวิร์ด -->
            {#if lineOaSubTab === 'bot'}
                <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                    <!-- กล่องที่ 4: การจัดการข้อความอัตโนมัติ (Auto-Replies & Keywords) -->
            <div class="info-card" style="padding: 1.5rem; background: #ffffff; border: 1px solid #cbd5e1;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.25rem;">
                    <div>
                        <h3 style="margin: 0 0 0.25rem 0; font-size: 1.15rem; color: #14532d; font-weight: 800;">
                            🤖 5. จัดการข้อความอัตโนมัติ (Auto-Replies &amp; คีย์เวิร์ด)
                        </h3>
                        <p style="margin: 0; font-size: 0.85rem; color: #64748b;">
                            กำหนดคำตอบที่บอทจะตอบกลับลูกค้าอัตโนมัติเมื่อพิมพ์คีย์เวิร์ดต่างๆ เข้ามา
                        </p>
                    </div>

                    <label style="display: inline-flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                        <input
                            type="checkbox"
                            bind:checked={settings.lineOa.autoReplyEnabled}
                            style="width: 18px; height: 18px; accent-color: #166534;"
                        />
                        <span style="font-size: 0.9rem; font-weight: 700; color: #1e293b;">
                            เปิดระบบตอบกลับอัตโนมัติ
                        </span>
                    </label>
                </div>

                <!-- ข้อความต้อนรับ & Fallback -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
                    <div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                            <label for="lineWelcomeMsg" style="font-size: 0.85rem; font-weight: 700; color: #1e293b;">
                                ข้อความต้อนรับเมื่อแอดเพื่อนใหม่ (Welcome Message):
                            </label>
                            {#if settings.lineOa.useCustomWelcomeCard}
                                <span style="font-size: 0.72rem; background: #dcfce7; color: #166534; font-weight: 800; padding: 0.1rem 0.45rem; border-radius: 6px; border: 1px solid #86efac;">
                                    🎨 ใช้การ์ด Flex Card
                                </span>
                            {/if}
                        </div>
                        {#if settings.lineOa.useCustomWelcomeCard}
                            <div style="background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 8px; padding: 0.65rem 0.75rem; font-size: 0.82rem; color: #166534; margin-bottom: 0.5rem; line-height: 1.45;">
                                <strong>✓ กำลังใช้งานการ์ดต้อนรับแบบ Flex Card</strong> (ระบบจะส่งการ์ดที่ออกแบบไว้ในข้อ 6 ให้ลูกค้าทันทีเมื่อกดเพิ่มเพื่อน)
                                <div style="margin-top: 0.35rem;">
                                    <button type="button" onclick={unsetWelcomeCard} style="font-size: 0.75rem; background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; border-radius: 4px; padding: 0.2rem 0.5rem; cursor: pointer; font-weight: 700;">
                                        กลับไปใช้ข้อความตัวอักษรปกติ
                                    </button>
                                </div>
                            </div>
                        {/if}
                        <textarea
                            id="lineWelcomeMsg"
                            bind:value={settings.lineOa.welcomeMessage}
                            rows={settings.lineOa.useCustomWelcomeCard ? 2 : 4}
                            placeholder="ข้อความทักทายเมื่อลูกค้าเพิ่ม LINE OA เป็นเพื่อนครั้งแรก..."
                            style="width: 100%; padding: 0.6rem 0.75rem; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 0.85rem; line-height: 1.5;"
                        ></textarea>
                    </div>

                    <div>
                        <label for="lineDefaultMsg" style="display: block; font-size: 0.85rem; font-weight: 700; color: #1e293b; margin-bottom: 0.35rem;">
                            ข้อความตอบกลับเริ่มต้นเมื่อไม่ตรงกับคีย์เวิร์ด (Fallback Reply):
                        </label>
                        <textarea
                            id="lineDefaultMsg"
                            bind:value={settings.lineOa.defaultReplyMessage}
                            rows={4}
                            placeholder="ข้อความที่จะตอบเมื่อลูกค้าพิมพ์คำที่ไม่ตรงกับคีย์เวิร์ดใดๆ..."
                            style="width: 100%; padding: 0.6rem 0.75rem; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 0.85rem; line-height: 1.5;"
                        ></textarea>
                    </div>
                </div>

                <!-- การตั้งค่าการตอบกลับเมื่อพิมพ์เบอร์โทร 10 หลัก (Phone Number Received Events) -->
                <div style="background: #fdf2f8; border: 1.5px solid #fbcfe8; border-radius: 14px; padding: 1.25rem; margin-bottom: 1.5rem;">
                    <!-- ส่วนหัวกล่องพร้อม Checkbox เปิด/ปิดระบบ -->
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; border-bottom: 1px solid #fbcfe8; padding-bottom: 0.85rem; margin-bottom: 1rem;">
                        <div style="display: flex; align-items: center; gap: 0.65rem;">
                            <span style="font-size: 1.5rem;">📱</span>
                            <div>
                                <h4 style="margin: 0; font-size: 1rem; color: #831843; font-weight: 800; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                                    การตอบกลับเมื่อลูกค้าพิมพ์เบอร์โทรศัพท์ 10 หลัก (Event ได้เบอร์)
                                    {#if settings.lineOa.notifyOnPhoneLinked !== false}
                                        <span style="font-size: 0.72rem; background: #22c55e; color: #ffffff; font-weight: 800; padding: 0.15rem 0.5rem; border-radius: 9999px;">
                                            ● เปิดใช้งานระบบ
                                        </span>
                                    {:else}
                                        <span style="font-size: 0.72rem; background: #e2e8f0; color: #64748b; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 9999px;">
                                            ○ ปิดใช้งาน
                                        </span>
                                    {/if}
                                </h4>
                                <span style="font-size: 0.8rem; color: #701a75;">
                                    เมื่อลูกค้าพิมพ์เบอร์โทร 10 หลักเข้ามาในห้องแชท LINE ระบบจะตรวจเช็คว่า <strong>"มีเบอร์นี้ในระบบสมาชิกแล้วหรือไม่"</strong> และตอบกลับตามข้อความ/การ์ดที่คุณกำหนดไว้ในแต่ละเหตุการณ์ด้านล่างค่ะ
                                </span>
                            </div>
                        </div>

                        <label style="display: inline-flex; align-items: center; gap: 0.45rem; font-size: 0.85rem; font-weight: 800; color: #831843; cursor: pointer; background: #ffffff; padding: 0.4rem 0.85rem; border-radius: 8px; border: 1.5px solid #f472b6; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                            <input
                                type="checkbox"
                                bind:checked={settings.lineOa.notifyOnPhoneLinked}
                                style="width: 18px; height: 18px; accent-color: #be185d;"
                            />
                            <span>เปิดตอบกลับอัตโนมัติเมื่อได้เบอร์</span>
                        </label>
                    </div>

                    <!-- 2 เหตุการณ์หลัก (ตรวจพบในระบบ VS ไม่พบในระบบ) -->
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.25rem;">
                        
                        <!-- 🟢 เหตุการณ์ที่ 1: ตรวจพบเบอร์ในระบบ (ลูกค้าเป็นสมาชิกอยู่แล้ว) -->
                        <div style="background: #ffffff; border: 1.5px solid #86efac; border-radius: 12px; padding: 1rem; box-shadow: 0 2px 4px rgba(0,0,0,0.03);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.65rem;">
                                <div style="display: flex; align-items: center; gap: 0.45rem;">
                                    <span style="font-size: 1.15rem;">🟢</span>
                                    <strong style="font-size: 0.92rem; color: #166534;">เหตุการณ์: ตรวจพบเบอร์ในระบบ (สมาชิกเดิม)</strong>
                                </div>
                                {#if settings.lineOa.useCustomMemberCard}
                                    <span style="font-size: 0.7rem; background: #dcfce7; color: #15803d; font-weight: 800; padding: 0.15rem 0.5rem; border-radius: 9999px; border: 1px solid #86efac;">
                                        🎨 การ์ด Flex ออกแบบเอง
                                    </span>
                                {:else}
                                    <span style="font-size: 0.7rem; background: #f1f5f9; color: #475569; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 9999px; border: 1px solid #cbd5e1;">
                                        ⚙️ การ์ด Flex ระบบ
                                    </span>
                                {/if}
                            </div>

                            <p style="margin: 0 0 0.75rem 0; font-size: 0.78rem; color: #4b5563; line-height: 1.45;">
                                ส่งเมื่อลูกค้าพิมพ์เบอร์ที่เคยสมัครสมาชิกแล้ว เพื่อแจ้งผลการผูก LINE และแสดงแต้มสะสม
                            </p>

                            <!-- รูปแบบการส่ง -->
                            <div style="margin-bottom: 0.65rem;">
                                <label for="phoneLinkedExistingReplyType" style="display: block; font-size: 0.8rem; font-weight: 700; color: #1e293b; margin-bottom: 0.25rem;">
                                    รูปแบบการตอบกลับ:
                                </label>
                                <select
                                    id="phoneLinkedExistingReplyType"
                                    class="form-input"
                                    bind:value={settings.lineOa.phoneLinkedExistingReplyType}
                                    style="font-size: 0.82rem; padding: 0.35rem 0.6rem; width: 100%; border-radius: 6px;"
                                >
                                    <option value="card">🗂️ ส่งเฉพาะการ์ด Flex Message (แนะนำ)</option>
                                    <option value="text">💬 ส่งเฉพาะข้อความตัวอักษร (Text)</option>
                                    <option value="both">🗂️ + 💬 ส่งทั้งการ์ด Flex และข้อความ</option>
                                </select>
                            </div>

                            <!-- ข้อความตัวอักษร -->
                            <div style="margin-bottom: 0.65rem;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                                    <label for="phoneLinkedExistingMsg" style="font-size: 0.8rem; font-weight: 700; color: #1e293b; margin: 0;">
                                        ข้อความตอบกลับ:
                                    </label>
                                    <span style="font-size: 0.7rem; color: #64748b;">กดเลือกตัวแปร:</span>
                                </div>
                                <div style="display: flex; gap: 0.25rem; flex-wrap: wrap; margin-bottom: 0.35rem;">
                                    <button type="button" onclick={() => insertVariableToPhoneEvent('existing', '{name}')} style="padding: 0.15rem 0.45rem; font-size: 0.72rem; background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; border-radius: 4px; cursor: pointer; font-weight: 700;">+{'{name}'} (ชื่อ)</button>
                                    <button type="button" onclick={() => insertVariableToPhoneEvent('existing', '{points}')} style="padding: 0.15rem 0.45rem; font-size: 0.72rem; background: #fff7ed; border: 1px solid #fed7aa; color: #c2410c; border-radius: 4px; cursor: pointer; font-weight: 700;">+{'{points}'} (แต้ม)</button>
                                    <button type="button" onclick={() => insertVariableToPhoneEvent('existing', '{phone}')} style="padding: 0.15rem 0.45rem; font-size: 0.72rem; background: #fdf2f8; border: 1px solid #fbcfe8; color: #9d174d; border-radius: 4px; cursor: pointer; font-weight: 700;">+{'{phone}'} (เบอร์)</button>
                                    <button type="button" onclick={() => insertVariableToPhoneEvent('existing', '{loyaltyUrl}')} style="padding: 0.15rem 0.45rem; font-size: 0.72rem; background: #e0f2fe; border: 1px solid #bae6fd; color: #0369a1; border-radius: 4px; cursor: pointer; font-weight: 700;">+{'{loyaltyUrl}'} (ลิงก์บัตร)</button>
                                    <button type="button" onclick={() => insertVariableToPhoneEvent('existing', '{menuUrl}')} style="padding: 0.15rem 0.45rem; font-size: 0.72rem; background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; border-radius: 4px; cursor: pointer; font-weight: 700;">+{'{menuUrl}'} (ลิงก์เมนู)</button>
                                </div>
                                <textarea
                                    id="phoneLinkedExistingMsg"
                                    bind:value={settings.lineOa.phoneLinkedExistingMessage}
                                    rows={3}
                                    placeholder={'ยินดีต้อนรับคุณ {name} ✨ คุณมีคะแนนสะสม {points} ดวง ระบบเชื่อมต่อ LINE กับบัญชีสมาชิกเรียบร้อยแล้วค่ะ! 🍵'}
                                    style="width: 100%; padding: 0.5rem 0.65rem; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 0.82rem; line-height: 1.45;"
                                ></textarea>
                                <div style="margin-top: 0.3rem; font-size: 0.72rem; color: #64748b; line-height: 1.35;">
                                    💡 ตัวแปรที่แทนค่าอัตโนมัติ: <code style="background: #f1f5f9; padding: 0.1rem 0.3rem; border-radius: 4px; color: #166534;">{'{name}'}</code> ชื่อลูกค้า, <code style="background: #f1f5f9; padding: 0.1rem 0.3rem; border-radius: 4px; color: #166534;">{'{points}'}</code> แต้มสะสม, <code style="background: #f1f5f9; padding: 0.1rem 0.3rem; border-radius: 4px; color: #166534;">{'{phone}'}</code> เบอร์โทร, <code style="background: #f1f5f9; padding: 0.1rem 0.3rem; border-radius: 4px; color: #166534;">{'{loyaltyUrl}'}</code> ลิงก์บัตรแต้ม
                                </div>
                            </div>

                            <!-- ปุ่มจัดการการ์ด Flex สมาชิกเดิม -->
                            <div style="display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; border-top: 1px dashed #e2e8f0; padding-top: 0.5rem;">
                                <button
                                    type="button"
                                    onclick={loadSavedMemberCard}
                                    style="padding: 0.3rem 0.6rem; font-size: 0.76rem; font-weight: 700; background: #f0fdf4; color: #15803d; border: 1px solid #86efac; border-radius: 6px; cursor: pointer;"
                                    title="โหลดการ์ดสมาชิกเดิมลงใน Card Designer ด้านล่างเพื่อแก้ไข"
                                >
                                    🎨 แก้ไขการ์ดใน Designer
                                </button>
                                {#if settings.lineOa.useCustomMemberCard}
                                    <button
                                        type="button"
                                        onclick={unsetMemberCard}
                                        style="padding: 0.3rem 0.6rem; font-size: 0.76rem; font-weight: 700; background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; cursor: pointer;"
                                    >
                                        สลับไปใช้การ์ดระบบ
                                    </button>
                                {/if}
                            </div>
                        </div>

                        <!-- 🟡 เหตุการณ์ที่ 2: ไม่พบเบอร์ในระบบ (ยังไม่เคยเป็นสมาชิก) -->
                        <div style="background: #ffffff; border: 1.5px solid #f472b6; border-radius: 12px; padding: 1rem; box-shadow: 0 2px 4px rgba(0,0,0,0.03);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.65rem;">
                                <div style="display: flex; align-items: center; gap: 0.45rem;">
                                    <span style="font-size: 1.15rem;">🟡</span>
                                    <strong style="font-size: 0.92rem; color: #9d174d;">เหตุการณ์: ยังไม่พบเบอร์ในระบบ (ลูกค้าใหม่)</strong>
                                </div>
                                {#if settings.lineOa.useCustomRegisterCard}
                                    <span style="font-size: 0.7rem; background: #fdf2f8; color: #db2777; font-weight: 800; padding: 0.15rem 0.5rem; border-radius: 9999px; border: 1px solid #f472b6;">
                                        🎨 การ์ด Flex ออกแบบเอง
                                    </span>
                                {:else}
                                    <span style="font-size: 0.7rem; background: #f1f5f9; color: #475569; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 9999px; border: 1px solid #cbd5e1;">
                                        ⚙️ การ์ด Flex ระบบ
                                    </span>
                                {/if}
                            </div>

                            <p style="margin: 0 0 0.75rem 0; font-size: 0.78rem; color: #4b5563; line-height: 1.45;">
                                ส่งเมื่อลูกค้าพิมพ์เบอร์ที่ยังไม่เคยสมัครสมาชิก เพื่อชวนสมัครสะสมแต้ม (ระบบจะกรอกเบอร์โทรให้อัตโนมัติ)
                            </p>

                            <!-- รูปแบบการส่ง -->
                            <div style="margin-bottom: 0.65rem;">
                                <label for="phoneLinkedNewReplyType" style="display: block; font-size: 0.8rem; font-weight: 700; color: #1e293b; margin-bottom: 0.25rem;">
                                    รูปแบบการตอบกลับ:
                                </label>
                                <select
                                    id="phoneLinkedNewReplyType"
                                    class="form-input"
                                    bind:value={settings.lineOa.phoneLinkedNewReplyType}
                                    style="font-size: 0.82rem; padding: 0.35rem 0.6rem; width: 100%; border-radius: 6px;"
                                >
                                    <option value="card">🗂️ ส่งเฉพาะการ์ด Flex ชวนสมัคร (แนะนำ)</option>
                                    <option value="text">💬 ส่งเฉพาะข้อความตัวอักษร (Text)</option>
                                    <option value="both">🗂️ + 💬 ส่งทั้งการ์ด Flex และข้อความ</option>
                                </select>
                            </div>

                            <!-- ข้อความตัวอักษร -->
                            <div style="margin-bottom: 0.65rem;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                                    <label for="phoneLinkedNewMsg" style="font-size: 0.8rem; font-weight: 700; color: #1e293b; margin: 0;">
                                        ข้อความตอบกลับ:
                                    </label>
                                    <span style="font-size: 0.7rem; color: #64748b;">กดเลือกตัวแปร:</span>
                                </div>
                                <div style="display: flex; gap: 0.25rem; flex-wrap: wrap; margin-bottom: 0.35rem;">
                                    <button type="button" onclick={() => insertVariableToPhoneEvent('new', '{phone}')} style="padding: 0.15rem 0.45rem; font-size: 0.72rem; background: #fdf2f8; border: 1px solid #fbcfe8; color: #9d174d; border-radius: 4px; cursor: pointer; font-weight: 700;">+{'{phone}'} (เบอร์ที่พิมพ์)</button>
                                    <button type="button" onclick={() => insertVariableToPhoneEvent('new', '{registerUrl}')} style="padding: 0.15rem 0.45rem; font-size: 0.72rem; background: #fdf2f8; border: 1px solid #f472b6; color: #831843; border-radius: 4px; cursor: pointer; font-weight: 700;">+{'{registerUrl}'} (ลิงก์สมัครสมาชิก)</button>
                                    <button type="button" onclick={() => insertVariableToPhoneEvent('new', '{menuUrl}')} style="padding: 0.15rem 0.45rem; font-size: 0.72rem; background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; border-radius: 4px; cursor: pointer; font-weight: 700;">+{'{menuUrl}'} (ลิงก์เมนู)</button>
                                </div>
                                <textarea
                                    id="phoneLinkedNewMsg"
                                    bind:value={settings.lineOa.phoneLinkedNewMessage}
                                    rows={3}
                                    placeholder={'บันทึกเบอร์โทรศัพท์ {phone} เรียบร้อยแล้วค่ะ! คุณยังไม่ได้เป็นสมาชิกสะสมแต้ม กดสมัครสมาชิกสะสมแต้มเพื่อรับสิทธิ์ 10 แก้วฟรี 1 แก้วได้เลยนะคะ 🍵'}
                                    style="width: 100%; padding: 0.5rem 0.65rem; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 0.82rem; line-height: 1.45;"
                                ></textarea>
                                <div style="margin-top: 0.3rem; font-size: 0.72rem; color: #64748b; line-height: 1.35;">
                                    💡 ตัวแปรที่แทนค่าอัตโนมัติ: <code style="background: #f1f5f9; padding: 0.1rem 0.3rem; border-radius: 4px; color: #9d174d;">{'{phone}'}</code> เบอร์โทร, <code style="background: #f1f5f9; padding: 0.1rem 0.3rem; border-radius: 4px; color: #9d174d;">{'{registerUrl}'}</code> ลิงก์สมัครสมาชิกพร้อมเบอร์, <code style="background: #f1f5f9; padding: 0.1rem 0.3rem; border-radius: 4px; color: #9d174d;">{'{menuUrl}'}</code> ลิงก์เมนู
                                </div>
                            </div>

                            <!-- ปุ่มจัดการการ์ด Flex ชวนสมัครสมาชิก -->
                            <div style="display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; border-top: 1px dashed #e2e8f0; padding-top: 0.5rem;">
                                <button
                                    type="button"
                                    onclick={loadSavedRegisterCard}
                                    style="padding: 0.3rem 0.6rem; font-size: 0.76rem; font-weight: 700; background: #fdf2f8; color: #be185d; border: 1px solid #f472b6; border-radius: 6px; cursor: pointer;"
                                    title="โหลดการ์ดชวนสมัครสมาชิกลงใน Card Designer ด้านล่างเพื่อแก้ไข"
                                >
                                    🎨 แก้ไขการ์ดใน Designer
                                </button>
                                {#if settings.lineOa.useCustomRegisterCard}
                                    <button
                                        type="button"
                                        onclick={unsetRegisterCard}
                                        style="padding: 0.3rem 0.6rem; font-size: 0.76rem; font-weight: 700; background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; cursor: pointer;"
                                    >
                                        สลับไปใช้การ์ดระบบ
                                    </button>
                                {/if}
                            </div>
                        </div>

                    </div>
                </div>

                <!-- ตารางคีย์เวิร์ดตอบกลับ -->
                <div style="border-top: 1px solid #e2e8f0; padding-top: 1.25rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1rem;">
                        <div>
                            <h4 style="margin: 0; font-size: 1rem; color: #1e293b; font-weight: 800;">
                                📋 รายการคีย์เวิร์ดตอบกลับ ({settings.lineOa.keywordReplies?.length || 0} รายการ)
                            </h4>
                            <span style="font-size: 0.8rem; color: #64748b;">
                                หากลูกค้าพิมพ์เบอร์โทรศัพท์ 10 หลัก ระบบจะทำการผูกเบอร์เข้ากับบัญชีสมาชิกโดยอัตโนมัติ
                            </span>
                        </div>

                        <button
                            type="button"
                            onclick={openAddKeywordModal}
                            class="btn-matcha-primary"
                            style="padding: 0.5rem 1rem; font-size: 0.85rem; font-weight: 700; display: inline-flex; align-items: center; gap: 0.35rem;"
                        >
                            ➕ เพิ่มคีย์เวิร์ดใหม่
                        </button>
                    </div>

                    <div style="overflow-x: auto;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 0.88rem;">
                            <thead>
                                <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1; text-align: left;">
                                    <th style="padding: 0.75rem 1rem; color: #334155;">คีย์เวิร์ด (คำที่พิมพ์)</th>
                                    <th style="padding: 0.75rem 1rem; color: #334155;">เงื่อนไข</th>
                                    <th style="padding: 0.75rem 1rem; color: #334155;">รูปแบบการตอบกลับ</th>
                                    <th style="padding: 0.75rem 1rem; color: #334155;">ตัวอย่างข้อความ</th>
                                    <th style="padding: 0.75rem 1rem; text-align: center; color: #334155;">สถานะ</th>
                                    <th style="padding: 0.75rem 1rem; text-align: right; color: #334155;">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each settings.lineOa.keywordReplies || [] as kw (kw.id)}
                                    <tr style="border-bottom: 1px solid #e2e8f0; background: {kw.enabled ? '#ffffff' : '#f8fafc'};">
                                        <td style="padding: 0.75rem 1rem; font-weight: 700; color: #166534;">
                                            "{kw.keyword}"
                                        </td>
                                        <td style="padding: 0.75rem 1rem; color: #64748b; font-size: 0.82rem;">
                                            {kw.matchType === 'exact' ? 'ตรงกันทุกคำ (Exact)' : 'มีคำนี้อยู่ (Contains)'}
                                        </td>
                                        <td style="padding: 0.75rem 1rem;">
                                            {#if kw.replyType === 'flex_menu'}
                                                <span style="background: #dcfce7; color: #166534; padding: 0.15rem 0.5rem; border-radius: 6px; font-size: 0.78rem; font-weight: 700;">
                                                    🍵 การ์ดเมนู Flex
                                                </span>
                                            {:else if kw.replyType === 'flex_status'}
                                                <span style="background: #e0f2fe; color: #0369a1; padding: 0.15rem 0.5rem; border-radius: 6px; font-size: 0.78rem; font-weight: 700;">
                                                    🔍 การ์ดสถานะ Flex
                                                </span>
                                            {:else if kw.replyType === 'flex_loyalty'}
                                                <span style="background: #fef3c7; color: #b45309; padding: 0.15rem 0.5rem; border-radius: 6px; font-size: 0.78rem; font-weight: 700;">
                                                    ⭐ การ์ดแต้ม Flex
                                                </span>
                                            {:else}
                                                <span style="background: #f1f5f9; color: #475569; padding: 0.15rem 0.5rem; border-radius: 6px; font-size: 0.78rem;">
                                                    💬 ข้อความ
                                                </span>
                                            {/if}
                                        </td>
                                        <td style="padding: 0.75rem 1rem; color: #475569; font-size: 0.82rem; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                            {kw.replyText || '-'}
                                        </td>
                                        <td style="padding: 0.75rem 1rem; text-align: center;">
                                            <input
                                                type="checkbox"
                                                bind:checked={kw.enabled}
                                                onchange={saveAllSettings}
                                                style="width: 18px; height: 18px; accent-color: #166534;"
                                            />
                                        </td>
                                        <td style="padding: 0.75rem 1rem; text-align: right; white-space: nowrap;">
                                            <button
                                                type="button"
                                                onclick={() => openEditKeywordModal(kw)}
                                                style="padding: 0.3rem 0.6rem; background: #e0f2fe; color: #0284c7; border: none; border-radius: 6px; font-weight: 700; font-size: 0.78rem; cursor: pointer; margin-right: 0.35rem;"
                                            >
                                                ✏️ แก้ไข
                                            </button>
                                            <button
                                                type="button"
                                                onclick={() => deleteKeyword(kw.id)}
                                                style="padding: 0.3rem 0.6rem; background: #fee2e2; color: #dc2626; border: none; border-radius: 6px; font-weight: 700; font-size: 0.78rem; cursor: pointer;"
                                            >
                                                🗑️ ลบ
                                            </button>
                                        </td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
                </div>
            {/if}

            <!-- 4. หมวด: ออกแบบการ์ด Flex -->
            {#if lineOaSubTab === 'designer'}
                <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                    <!-- กล่องที่ 6: 🎨 ระบบออกแบบ Card Layout ส่งหาลูกค้าแบบ Drag & Drop & ปุ่มลิงก์ -->
            <div class="info-card" style="padding: 1.5rem; background: #ffffff; border: 2px solid #86efac; border-radius: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1.25rem;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                            <span style="background: #166534; color: #ffffff; font-size: 0.75rem; font-weight: 800; padding: 0.2rem 0.55rem; border-radius: 6px;">
                                Flex Message Builder
                            </span>
                            <span style="background: #dcfce7; color: #15803d; font-size: 0.75rem; font-weight: 700; padding: 0.2rem 0.55rem; border-radius: 6px;">
                                Drag &amp; Drop / Interactive
                            </span>
                        </div>
                        <h3 style="margin: 0; font-size: 1.25rem; color: #14532d; font-weight: 800;">
                            🎨 6. ออกแบบการ์ดโปรโมชั่น &amp; ปุ่มลิงก์ส่งหาลูกค้า (Card Designer)
                        </h3>
                        <p style="margin: 0.25rem 0 0 0; font-size: 0.85rem; color: #64748b;">
                            ออกแบบการ์ดโปรโมชั่น ข่าวสาร หรือเมนูแนะนำได้อิสระ จัดเรียงบล็อกด้วยการลากวาง (Drag &amp; Drop) พร้อมปรับปุ่มกดและลิงก์หน้าเว็บได้ตามใจชอบ
                        </p>
                    </div>

                    <!-- แถบเลือกเทมเพลตด่วน -->
                    <div style="display: flex; flex-direction: column; gap: 0.5rem; max-width: 620px;">
                        <div style="display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center;">
                            <span style="font-size: 0.74rem; color: #475569; font-weight: 800;">🏷️ ทั่วไป & ต้อนรับ:</span>
                            <button type="button" onclick={() => loadDesignerPreset('welcome')} style="padding: 0.25rem 0.55rem; font-size: 0.75rem; font-weight: 800; background: #ecfdf5; border: 1.5px solid #10b981; color: #065f46; border-radius: 6px; cursor: pointer;">
                                👋 ต้อนรับเพื่อนใหม่
                            </button>
                            <button type="button" onclick={() => loadDesignerPreset('member')} style="padding: 0.25rem 0.55rem; font-size: 0.75rem; font-weight: 800; background: #f0fdf4; border: 1.5px solid #22c55e; color: #15803d; border-radius: 6px; cursor: pointer;">
                                🟢 สมาชิกเดิม
                            </button>
                            <button type="button" onclick={() => loadDesignerPreset('register')} style="padding: 0.25rem 0.55rem; font-size: 0.75rem; font-weight: 800; background: #fdf2f8; border: 1.5px solid #f472b6; color: #9d174d; border-radius: 6px; cursor: pointer;">
                                ✨ ชวนสมัครใหม่
                            </button>
                            <button type="button" onclick={() => loadDesignerPreset('loyalty')} style="padding: 0.25rem 0.55rem; font-size: 0.75rem; font-weight: 700; background: #fefce8; border: 1.5px solid #fde047; color: #854d0e; border-radius: 6px; cursor: pointer;">
                                ⭐ บัตรสะสมแต้ม
                            </button>
                            <button type="button" onclick={() => loadDesignerPreset('promo')} style="padding: 0.25rem 0.55rem; font-size: 0.75rem; font-weight: 700; background: #f0fdf4; border: 1.5px solid #86efac; color: #166534; border-radius: 6px; cursor: pointer;">
                                🍵 เมนูแนะนำ
                            </button>
                            <button type="button" onclick={() => loadDesignerPreset('delivery')} style="padding: 0.25rem 0.55rem; font-size: 0.75rem; font-weight: 700; background: #f0f9ff; border: 1.5px solid #7dd3fc; color: #0369a1; border-radius: 6px; cursor: pointer;">
                                🛵 รอบส่ง
                            </button>
                        </div>

                        <div style="display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; border-top: 1px dashed #e2e8f0; padding-top: 0.4rem;">
                            <span style="font-size: 0.74rem; color: #0f766e; font-weight: 800;">📢 แจ้งเตือนสถานะออเดอร์:</span>
                            <button type="button" onclick={() => loadDesignerPreset('status_order_created')} style="padding: 0.25rem 0.55rem; font-size: 0.75rem; font-weight: 700; background: #f8fafc; border: 1.5px solid #94a3b8; color: #334155; border-radius: 6px; cursor: pointer;" title="โหลดพรีเซ็ตการ์ดรับออเดอร์ใหม่ (ปุ่มลิงก์ไปหน้า /success ให้แนบสลิป)">
                                📝 รับออเดอร์ (Order Created)
                            </button>
                            <button type="button" onclick={() => loadDesignerPreset('status_slip_approved')} style="padding: 0.25rem 0.55rem; font-size: 0.75rem; font-weight: 700; background: #f0fdf4; border: 1.5px solid #86efac; color: #15803d; border-radius: 6px; cursor: pointer;" title="โหลดพรีเซ็ตการ์ดอนุมัติสลิป (ปุ่มลิงก์ไปหน้า /success)">
                                💳 อนุมัติสลิป (/success)
                            </button>
                            <button type="button" onclick={() => loadDesignerPreset('status_member_registered')} style="padding: 0.25rem 0.55rem; font-size: 0.75rem; font-weight: 700; background: #fdf2f8; border: 1.5px solid #f472b6; color: #9d174d; border-radius: 6px; cursor: pointer;" title="โหลดพรีเซ็ตการ์ดแจ้งเตือนลูกค้าสมัครสมาชิกสำเร็จ">
                                ✨ สมัครสมาชิกเสร็จ
                            </button>
                            <button type="button" onclick={() => loadDesignerPreset('status_brewing')} style="padding: 0.25rem 0.55rem; font-size: 0.75rem; font-weight: 700; background: #ccfbf1; border: 1.5px solid #14b8a6; color: #0f766e; border-radius: 6px; cursor: pointer;">
                                🍵 กำลังชง
                            </button>
                            <button type="button" onclick={() => loadDesignerPreset('status_ready')} style="padding: 0.25rem 0.55rem; font-size: 0.75rem; font-weight: 700; background: #d1fae5; border: 1.5px solid #10b981; color: #065f46; border-radius: 6px; cursor: pointer;">
                                ✨ ชงเสร็จ
                            </button>
                            <button type="button" onclick={() => loadDesignerPreset('status_delivering')} style="padding: 0.25rem 0.55rem; font-size: 0.75rem; font-weight: 700; background: #e0f2fe; border: 1.5px solid #38bdf8; color: #0284c7; border-radius: 6px; cursor: pointer;">
                                🛵 กำลังส่ง
                            </button>
                            <button type="button" onclick={() => loadDesignerPreset('status_completed')} style="padding: 0.25rem 0.55rem; font-size: 0.75rem; font-weight: 700; background: #dcfce7; border: 1.5px solid #86efac; color: #166534; border-radius: 6px; cursor: pointer;">
                                🎉 ส่งสำเร็จ
                            </button>
                            <button type="button" onclick={() => loadDesignerPreset('status_cancelled')} style="padding: 0.25rem 0.55rem; font-size: 0.75rem; font-weight: 700; background: #fee2e2; border: 1.5px solid #f87171; color: #991b1b; border-radius: 6px; cursor: pointer;">
                                ❌ ยกเลิก
                            </button>
                        </div>

                        {#if settings.lineOa.useCustomWelcomeCard || settings.lineOa.useCustomMemberCard || settings.lineOa.useCustomRegisterCard || Object.values(settings.lineOa.customStatusCards || {}).some(c => c?.enabled)}
                            <div style="display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; border-top: 1px dashed #e2e8f0; padding-top: 0.4rem;">
                                <span style="font-size: 0.74rem; color: #1e293b; font-weight: 800;">📂 ดึงการ์ดที่เซฟไว้กลับมาแก้ไข:</span>
                                {#if settings.lineOa.useCustomWelcomeCard}
                                    <button type="button" onclick={loadSavedWelcomeCard} style="padding: 0.2rem 0.5rem; font-size: 0.72rem; font-weight: 800; background: #ffffff; border: 1px solid #166534; color: #166534; border-radius: 6px; cursor: pointer;">
                                        👋 การ์ดต้อนรับ
                                    </button>
                                {/if}
                                {#if settings.lineOa.useCustomMemberCard}
                                    <button type="button" onclick={loadSavedMemberCard} style="padding: 0.2rem 0.5rem; font-size: 0.72rem; font-weight: 800; background: #ffffff; border: 1px solid #15803d; color: #15803d; border-radius: 6px; cursor: pointer;">
                                        🟢 การ์ดสมาชิกเดิม
                                    </button>
                                {/if}
                                {#if settings.lineOa.useCustomRegisterCard}
                                    <button type="button" onclick={loadSavedRegisterCard} style="padding: 0.2rem 0.5rem; font-size: 0.72rem; font-weight: 800; background: #ffffff; border: 1px solid #be185d; color: #be185d; border-radius: 6px; cursor: pointer;">
                                        ✨ การ์ดชวนสมัคร
                                    </button>
                                {/if}
                                {#each [
                                    { key: 'order_created', label: '📝 รับออเดอร์' },
                                    { key: 'member_registered', label: '🎉 สมัครสมาชิก' },
                                    { key: 'slip_approved', label: '💳 อนุมัติสลิป' },
                                    { key: 'brewing', label: '🍵 กำลังชง' },
                                    { key: 'ready_to_ship', label: '✨ ชงเสร็จ' },
                                    { key: 'delivering', label: '🛵 กำลังส่ง' },
                                    { key: 'completed', label: '🎉 ส่งสำเร็จ' },
                                    { key: 'cancelled', label: '❌ ยกเลิก' }
                                ] as st}
                                    {#if settings.lineOa.customStatusCards?.[st.key]?.enabled}
                                        <button
                                            type="button"
                                            onclick={() => loadSavedStatusCard(st.key)}
                                            style="padding: 0.2rem 0.5rem; font-size: 0.72rem; font-weight: 800; background: #f0fdfa; border: 1.5px solid #0d9488; color: #0f766e; border-radius: 6px; cursor: pointer;"
                                            title="ดึงการ์ดสถานะ {st.label} ที่บันทึกไว้กลับมาแก้ไขใน Designer"
                                        >
                                            {st.label} (ที่เซฟไว้)
                                        </button>
                                    {/if}
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>

                <!-- พื้นที่ทำงาน 2 ฝั่ง: ฝั่งซ้ายตัวแก้ไขบล็อก, ฝั่งขวาพรีวิวเสมือนจริง -->
                <!-- Mobile Switch ระหว่างแก้ไขบล็อก กับ ดูพรีวิว -->
                <div class="designer-mobile-switch">
                    <button
                        type="button"
                        class="designer-switch-btn {designerMobileTab === 'blocks' ? 'active' : ''}"
                        onclick={() => (designerMobileTab = 'blocks')}
                    >
                        🧱 แก้ไขบล็อก ({designerCardBlocks.length})
                    </button>
                    <button
                        type="button"
                        class="designer-switch-btn {designerMobileTab === 'preview' ? 'active' : ''}"
                        onclick={() => (designerMobileTab = 'preview')}
                    >
                        📱 ดูพรีวิวการ์ดจริง
                    </button>
                </div>

                <div class="designer-workspace-grid" style="display: grid; gap: 1.5rem; align-items: start;">
                    
                    <!-- ฝั่งซ้าย: บล็อกส่วนประกอบ และการแก้ไข -->
                    <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid #e2e8f0; padding-bottom: 0.5rem;">
                            <strong style="color: #1e293b; font-size: 0.95rem;">
                                🧱 บล็อกเนื้อหาของการ์ด ({designerCardBlocks.length} บล็อก)
                            </strong>
                            <span style="font-size: 0.75rem; color: #64748b;">
                                💡 ลากสลับตำแหน่ง หรือกด ⬆️ ⬇️ เพื่อเลื่อนบล็อกได้
                            </span>
                        </div>

                        <!-- รายการบล็อกที่สามารถลากวางได้ -->
                        <div style="display: flex; flex-direction: column; gap: 0.6rem;">
                            {#each designerCardBlocks as block, idx (block.id)}
                                <!-- svelte-ignore a11y_no_static_element_interactions -->
                                <div
                                    draggable="true"
                                    ondragstart={() => (draggedBlockIdx = idx)}
                                    ondragover={(e) => e.preventDefault()}
                                    ondrop={() => {
                                        if (draggedBlockIdx !== null && draggedBlockIdx !== idx) {
                                            const copy = [...designerCardBlocks];
                                            const [moved] = copy.splice(draggedBlockIdx, 1);
                                            copy.splice(idx, 0, moved);
                                            designerCardBlocks = copy;
                                            draggedBlockIdx = null;
                                        }
                                    }}
                                    style="background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 12px; padding: 0.75rem 0.85rem; transition: all 0.15s ease; box-shadow: 0 1px 3px rgba(0,0,0,0.03);"
                                >
                                    <!-- แถบหัวบล็อก -->
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; cursor: grab;">
                                        <div style="display: flex; align-items: center; gap: 0.45rem;">
                                            <span style="cursor: grab; color: #94a3b8; font-size: 1rem; user-select: none;">☰</span>
                                            {#if block.type === 'banner'}
                                                <span style="background: #dbeafe; color: #1e40af; font-size: 0.75rem; font-weight: 800; padding: 0.15rem 0.5rem; border-radius: 6px;">🖼️ แบนเนอร์รูปภาพ</span>
                                            {:else if block.type === 'tag'}
                                                <span style="background: #dcfce7; color: #166534; font-size: 0.75rem; font-weight: 800; padding: 0.15rem 0.5rem; border-radius: 6px;">🏷️ ป้ายแท็ก</span>
                                            {:else if block.type === 'title'}
                                                <span style="background: #f3e8ff; color: #6b21a8; font-size: 0.75rem; font-weight: 800; padding: 0.15rem 0.5rem; border-radius: 6px;">📝 หัวข้อหลัก</span>
                                            {:else if block.type === 'body'}
                                                <span style="background: #f1f5f9; color: #334155; font-size: 0.75rem; font-weight: 800; padding: 0.15rem 0.5rem; border-radius: 6px;">📄 ข้อความคำอธิบาย</span>
                                            {:else if block.type === 'highlight'}
                                                <span style="background: #fef3c7; color: #92400e; font-size: 0.75rem; font-weight: 800; padding: 0.15rem 0.5rem; border-radius: 6px;">💰 ไฮไลต์ / ราคา</span>
                                            {:else if block.type === 'button'}
                                                <span style="background: #bbf7d0; color: #14532d; font-size: 0.75rem; font-weight: 800; padding: 0.15rem 0.5rem; border-radius: 6px;">🔘 ปุ่มลิงก์แอ็กชัน</span>
                                            {/if}
                                        </div>

                                        <div style="display: flex; align-items: center; gap: 0.25rem;">
                                            <button
                                                type="button"
                                                onclick={() => moveDesignerBlock(idx, 'up')}
                                                disabled={idx === 0}
                                                style="padding: 0.15rem 0.4rem; font-size: 0.72rem; border-radius: 4px; border: 1px solid #cbd5e1; background: #ffffff; cursor: {idx === 0 ? 'not-allowed' : 'pointer'}; opacity: {idx === 0 ? '0.4' : '1'};"
                                                title="เลื่อนขึ้น"
                                            >
                                                ⬆️
                                            </button>
                                            <button
                                                type="button"
                                                onclick={() => moveDesignerBlock(idx, 'down')}
                                                disabled={idx === designerCardBlocks.length - 1}
                                                style="padding: 0.15rem 0.4rem; font-size: 0.72rem; border-radius: 4px; border: 1px solid #cbd5e1; background: #ffffff; cursor: {idx === designerCardBlocks.length - 1 ? 'not-allowed' : 'pointer'}; opacity: {idx === designerCardBlocks.length - 1 ? '0.4' : '1'};"
                                                title="เลื่อนลง"
                                            >
                                                ⬇️
                                            </button>
                                            <button
                                                type="button"
                                                onclick={() => removeDesignerBlock(block.id)}
                                                style="padding: 0.15rem 0.4rem; font-size: 0.72rem; border-radius: 4px; border: 1px solid #fecaca; background: #fee2e2; color: #dc2626; cursor: pointer; margin-left: 0.25rem;"
                                                title="ลบบล็อกนี้"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>

                                    <!-- ฟิลด์แก้ไขของบล็อกแต่ละประเภท -->
                                    {#if block.type === 'banner'}
                                        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                                            <div>
                                                <label style="display: block; font-size: 0.74rem; font-weight: 700; color: #475569; margin-bottom: 0.2rem;">
                                                    🔗 URL รูปภาพแบนเนอร์ / มาสคอต:
                                                </label>
                                                <input
                                                    type="text"
                                                    class="form-input"
                                                    bind:value={block.imageUrl}
                                                    placeholder="URL รูปภาพแบนเนอร์ (https://...)"
                                                    style="font-size: 0.82rem; padding: 0.35rem 0.65rem; width: 100%;"
                                                />
                                            </div>

                                            <!-- แถวตั้งค่าขนาด, สัดส่วน และโหมดจัดรูป -->
                                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 0.45rem; background: #f8fafc; padding: 0.5rem; border-radius: 8px; border: 1px solid #e2e8f0;">
                                                <!-- 1. สัดส่วนภาพ (Aspect Ratio) -->
                                                <div>
                                                    <label style="display: block; font-size: 0.72rem; font-weight: 700; color: #334155; margin-bottom: 0.2rem;">
                                                        📐 สัดส่วนภาพ:
                                                    </label>
                                                    <select
                                                        class="form-input"
                                                        bind:value={block.aspectRatio}
                                                        style="width: 100%; font-size: 0.78rem; padding: 0.3rem 0.4rem; background: #ffffff;"
                                                    >
                                                        <option value="1:1">1:1 (จัตุรัส - แมว/สินค้า)</option>
                                                        <option value="20:13">20:13 (มาตรฐาน LINE)</option>
                                                        <option value="16:9">16:9 (แนวนอนจอไวด์)</option>
                                                        <option value="4:3">4:3 (แนวนอนคลาสสิก)</option>
                                                        <option value="3:2">3:2 (แนวนอน 3:2)</option>
                                                        <option value="3:4">3:4 (แนวตั้ง 3:4)</option>
                                                        <option value="9:16">9:16 (แนวตั้งยาว)</option>
                                                    </select>
                                                </div>

                                                <!-- 2. ขนาดภาพ (Size) -->
                                                <div>
                                                    <label style="display: block; font-size: 0.72rem; font-weight: 700; color: #334155; margin-bottom: 0.2rem;">
                                                        📏 ขนาดภาพ (Size):
                                                    </label>
                                                    <select
                                                        class="form-input"
                                                        bind:value={block.imageSize}
                                                        style="width: 100%; font-size: 0.78rem; padding: 0.3rem 0.4rem; background: #ffffff;"
                                                    >
                                                        <option value="full">เต็มขอบการ์ด (100% Full)</option>
                                                        <option value="5xl">ใหญ่พิเศษ (5xl ~280px)</option>
                                                        <option value="4xl">ใหญ่ (4xl ~240px)</option>
                                                        <option value="3xl">ขนาดกลาง (3xl ~200px)</option>
                                                        <option value="xxl">ขนาดพอดี (xxl ~160px)</option>
                                                        <option value="xl">ขนาดเล็ก (xl ~120px)</option>
                                                        <option value="lg">กะทัดรัด (lg ~80px)</option>
                                                    </select>
                                                </div>

                                                <!-- 3. โหมดการแสดงผล (Aspect Mode) -->
                                                <div>
                                                    <label style="display: block; font-size: 0.72rem; font-weight: 700; color: #334155; margin-bottom: 0.2rem;">
                                                        🔍 โหมดการแสดง (Fit):
                                                    </label>
                                                    <select
                                                        class="form-input"
                                                        bind:value={block.aspectMode}
                                                        style="width: 100%; font-size: 0.78rem; padding: 0.3rem 0.4rem; background: #ffffff;"
                                                    >
                                                        <option value="cover">Cover (เต็มกรอบ ครอปขอบ)</option>
                                                        <option value="fit">Fit (เห็นครบทั้งรูป ไม่ตัดขอบ)</option>
                                                    </select>
                                                </div>
                                            </div>

                                            <!-- 🐱 คลังเลือกมาสคอตน้องแมว (7 อารมณ์) -->
                                            <div style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 0.5rem 0.6rem;">
                                                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.35rem;">
                                                    <span style="font-size: 0.76rem; font-weight: 700; color: #475569;">🐱 เลือกรูปมาสคอตน้องแมว (7 อารมณ์สำหรับแจ้งเตือน):</span>
                                                    <span style="font-size: 0.68rem; color: #94a3b8;">คลิกเพื่อนำรูปไปใส่</span>
                                                </div>
                                                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 0.4rem;">
                                                    {#each catMascots as mascot}
                                                        <button
                                                            type="button"
                                                            onclick={() => {
                                                                block.imageUrl = mascot.url;
                                                                block.aspectRatio = '1:1';
                                                            }}
                                                            style="display: flex; align-items: center; gap: 0.4rem; padding: 0.35rem 0.45rem; border-radius: 6px; border: {block.imageUrl === mascot.url ? '2px solid #16a34a' : '1px solid #e2e8f0'}; background: {block.imageUrl === mascot.url ? '#f0fdf4' : '#ffffff'}; text-align: left; cursor: pointer; transition: all 0.15s ease;"
                                                            title="{mascot.name} - {mascot.desc}"
                                                        >
                                                            <img
                                                                src={mascot.url}
                                                                alt={mascot.name}
                                                                style="width: 38px; height: 38px; border-radius: 4px; object-fit: cover; flex-shrink: 0; background: #ffffff;"
                                                            />
                                                            <div style="min-width: 0; overflow: hidden;">
                                                                <div style="font-size: 0.74rem; font-weight: 700; color: {block.imageUrl === mascot.url ? '#15803d' : '#334155'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                                                    {mascot.shortName}
                                                                </div>
                                                                <div style="font-size: 0.65rem; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                                                    {mascot.desc}
                                                                </div>
                                                            </div>
                                                        </button>
                                                    {/each}
                                                </div>
                                            </div>
                                        </div>
                                    {:else if block.type === 'tag'}
                                        <div>
                                            <div style="display: flex; gap: 0.4rem; align-items: center;">
                                                <input
                                                    type="text"
                                                    class="form-input"
                                                    bind:value={block.tagText}
                                                    placeholder="ข้อความป้าย เช่น 🍵 เมนูใหม่แนะนำ"
                                                    style="font-size: 0.82rem; padding: 0.35rem 0.65rem;"
                                                />
                                                <input
                                                    type="color"
                                                    bind:value={block.tagBg}
                                                    title="สีพื้นหลังป้าย"
                                                    style="width: 38px; height: 34px; padding: 2px; border: 1px solid #cbd5e1; border-radius: 6px; cursor: pointer;"
                                                />
                                                <input
                                                    type="color"
                                                    bind:value={block.tagColor}
                                                    title="สีตัวอักษรป้าย"
                                                    style="width: 38px; height: 34px; padding: 2px; border: 1px solid #cbd5e1; border-radius: 6px; cursor: pointer;"
                                                />
                                            </div>
                                            <div style="display: flex; align-items: center; gap: 0.25rem; flex-wrap: wrap; margin-top: 0.3rem;">
                                                <span style="font-size: 0.68rem; color: #64748b;">กดเลือกตัวแปร:</span>
                                                <button type="button" onclick={() => insertVariableToBlock(block, 'tagText', '{orderCode}')} style="padding: 0.1rem 0.35rem; font-size: 0.68rem; background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; border-radius: 4px; cursor: pointer;">+{'{orderCode}'}</button>
                                                <button type="button" onclick={() => insertVariableToBlock(block, 'tagText', '{name}')} style="padding: 0.1rem 0.35rem; font-size: 0.68rem; background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; border-radius: 4px; cursor: pointer;">+{'{name}'}</button>
                                            </div>
                                        </div>
                                    {:else if block.type === 'title'}
                                        <div>
                                            <div style="display: flex; gap: 0.4rem; align-items: center;">
                                                <input
                                                    type="text"
                                                    class="form-input"
                                                    bind:value={block.titleText}
                                                    placeholder="หัวข้อการ์ด เช่น Cold-Fermented Matcha Oat Latte"
                                                    style="font-size: 0.85rem; font-weight: 700; padding: 0.4rem 0.65rem;"
                                                />
                                                <select
                                                    class="form-input"
                                                    bind:value={block.titleSize}
                                                    style="width: 100px; font-size: 0.8rem; padding: 0.4rem 0.5rem;"
                                                >
                                                    <option value="md">ขนาดปกติ</option>
                                                    <option value="lg">ขนาดใหญ่</option>
                                                    <option value="xl">ใหญ่พิเศษ</option>
                                                </select>
                                            </div>
                                            <div style="display: flex; align-items: center; gap: 0.25rem; flex-wrap: wrap; margin-top: 0.3rem;">
                                                <span style="font-size: 0.68rem; color: #64748b;">กดเลือกตัวแปร:</span>
                                                <button type="button" onclick={() => insertVariableToBlock(block, 'titleText', '{orderCode}')} style="padding: 0.1rem 0.35rem; font-size: 0.68rem; background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; border-radius: 4px; cursor: pointer;">+{'{orderCode}'}</button>
                                                <button type="button" onclick={() => insertVariableToBlock(block, 'titleText', '{itemsSummary}')} style="padding: 0.1rem 0.35rem; font-size: 0.68rem; background: #e0f2fe; border: 1px solid #bae6fd; color: #0369a1; border-radius: 4px; cursor: pointer;">+{'{itemsSummary}'}</button>
                                                <button type="button" onclick={() => insertVariableToBlock(block, 'titleText', '{totalPrice}')} style="padding: 0.1rem 0.35rem; font-size: 0.68rem; background: #fefce8; border: 1px solid #fde047; color: #854d0e; border-radius: 4px; cursor: pointer;">+{'{totalPrice}'}</button>
                                                <button type="button" onclick={() => insertVariableToBlock(block, 'titleText', '{name}')} style="padding: 0.1rem 0.35rem; font-size: 0.68rem; background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; border-radius: 4px; cursor: pointer;">+{'{name}'}</button>
                                                <button type="button" onclick={() => insertVariableToBlock(block, 'titleText', '{phone}')} style="padding: 0.1rem 0.35rem; font-size: 0.68rem; background: #fdf2f8; border: 1px solid #fbcfe8; color: #9d174d; border-radius: 4px; cursor: pointer;">+{'{phone}'}</button>
                                                <button type="button" onclick={() => insertVariableToBlock(block, 'titleText', '{pin}')} style="padding: 0.1rem 0.35rem; font-size: 0.68rem; background: #f0fdfa; border: 1px solid #5eead4; color: #0f766e; border-radius: 4px; cursor: pointer; font-weight: 700;">+{'{pin}'}</button>
                                            </div>
                                        </div>
                                    {:else if block.type === 'body'}
                                        <div>
                                            <textarea
                                                class="form-input"
                                                bind:value={block.bodyText}
                                                rows="2"
                                                placeholder="รายละเอียดข้อความ หรือคำโปรยสินค้า..."
                                                style="font-size: 0.82rem; padding: 0.4rem 0.65rem; line-height: 1.45;"
                                            ></textarea>
                                            <div style="display: flex; align-items: center; gap: 0.25rem; flex-wrap: wrap; margin-top: 0.3rem;">
                                                <span style="font-size: 0.68rem; color: #64748b;">กดเลือกตัวแปร:</span>
                                                <button type="button" onclick={() => insertVariableToBlock(block, 'bodyText', '{orderCode}')} style="padding: 0.1rem 0.35rem; font-size: 0.68rem; background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; border-radius: 4px; cursor: pointer;">+{'{orderCode}'}</button>
                                                <button type="button" onclick={() => insertVariableToBlock(block, 'bodyText', '{itemsSummary}')} style="padding: 0.1rem 0.35rem; font-size: 0.68rem; background: #e0f2fe; border: 1px solid #bae6fd; color: #0369a1; border-radius: 4px; cursor: pointer;">+{'{itemsSummary}'}</button>
                                                <button type="button" onclick={() => insertVariableToBlock(block, 'bodyText', '{totalPrice}')} style="padding: 0.1rem 0.35rem; font-size: 0.68rem; background: #fefce8; border: 1px solid #fde047; color: #854d0e; border-radius: 4px; cursor: pointer;">+{'{totalPrice}'}</button>
                                                <button type="button" onclick={() => insertVariableToBlock(block, 'bodyText', '{name}')} style="padding: 0.1rem 0.35rem; font-size: 0.68rem; background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; border-radius: 4px; cursor: pointer;">+{'{name}'}</button>
                                                <button type="button" onclick={() => insertVariableToBlock(block, 'bodyText', '{phone}')} style="padding: 0.1rem 0.35rem; font-size: 0.68rem; background: #fdf2f8; border: 1px solid #fbcfe8; color: #9d174d; border-radius: 4px; cursor: pointer;">+{'{phone}'}</button>
                                                <button type="button" onclick={() => insertVariableToBlock(block, 'bodyText', '{pin}')} style="padding: 0.1rem 0.35rem; font-size: 0.68rem; background: #f0fdfa; border: 1px solid #5eead4; color: #0f766e; border-radius: 4px; cursor: pointer; font-weight: 700;">+{'{pin}'}</button>
                                                <button type="button" onclick={() => insertVariableToBlock(block, 'bodyText', '{points}')} style="padding: 0.1rem 0.35rem; font-size: 0.68rem; background: #fff7ed; border: 1px solid #fed7aa; color: #c2410c; border-radius: 4px; cursor: pointer;">+{'{points}'}</button>
                                                <button type="button" onclick={() => insertVariableToBlock(block, 'bodyText', '{url}')} style="padding: 0.1rem 0.35rem; font-size: 0.68rem; background: #f5f3ff; border: 1px solid #ddd6fe; color: #6d28d9; border-radius: 4px; cursor: pointer;">+{'{url}'}</button>
                                            </div>
                                        </div>
                                    {:else if block.type === 'highlight'}
                                        <div>
                                            <input
                                                type="text"
                                                class="form-input"
                                                bind:value={block.highlightText}
                                                placeholder="ข้อความเน้น เช่น ✨ ราคาพิเศษ 65.- หรือ ซื้อ 2 ฟรี 1"
                                                style="font-size: 0.85rem; font-weight: 700; color: #92400e; padding: 0.4rem 0.65rem; background: #fffdf5; border-color: #fde047;"
                                            />
                                            <div style="display: flex; align-items: center; gap: 0.25rem; flex-wrap: wrap; margin-top: 0.3rem;">
                                                <span style="font-size: 0.68rem; color: #64748b;">กดเลือกตัวแปร:</span>
                                                <button type="button" onclick={() => insertVariableToBlock(block, 'highlightText', '{orderCode}')} style="padding: 0.1rem 0.35rem; font-size: 0.68rem; background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; border-radius: 4px; cursor: pointer;">+{'{orderCode}'}</button>
                                                <button type="button" onclick={() => insertVariableToBlock(block, 'highlightText', '{itemsSummary}')} style="padding: 0.1rem 0.35rem; font-size: 0.68rem; background: #e0f2fe; border: 1px solid #bae6fd; color: #0369a1; border-radius: 4px; cursor: pointer;">+{'{itemsSummary}'}</button>
                                                <button type="button" onclick={() => insertVariableToBlock(block, 'highlightText', '{totalPrice}')} style="padding: 0.1rem 0.35rem; font-size: 0.68rem; background: #fefce8; border: 1px solid #fde047; color: #854d0e; border-radius: 4px; cursor: pointer;">+{'{totalPrice}'}</button>
                                                <button type="button" onclick={() => insertVariableToBlock(block, 'highlightText', '{pin}')} style="padding: 0.1rem 0.35rem; font-size: 0.68rem; background: #f0fdfa; border: 1px solid #5eead4; color: #0f766e; border-radius: 4px; cursor: pointer; font-weight: 700;">+{'{pin}'}</button>
                                                <button type="button" onclick={() => insertVariableToBlock(block, 'highlightText', '{points}')} style="padding: 0.1rem 0.35rem; font-size: 0.68rem; background: #fff7ed; border: 1px solid #fed7aa; color: #c2410c; border-radius: 4px; cursor: pointer;">+{'{points}'}</button>
                                            </div>
                                        </div>
                                    {:else if block.type === 'button'}
                                        <div style="display: flex; flex-direction: column; gap: 0.45rem; background: #ffffff; padding: 0.65rem; border-radius: 8px; border: 1px solid #e2e8f0;">
                                            <div style="display: grid; grid-template-columns: 1fr 140px; gap: 0.4rem;">
                                                <div>
                                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                                        <span style="font-size: 0.72rem; color: #64748b; font-weight: 600;">ข้อความบนปุ่ม (Label):</span>
                                                        <div style="display: flex; gap: 0.2rem;">
                                                            <button type="button" onclick={() => insertVariableToBlock(block, 'buttonLabel', '{orderCode}')} style="font-size: 0.65rem; padding: 0.05rem 0.3rem; background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; border-radius: 3px; cursor: pointer;">+{'{orderCode}'}</button>
                                                            <button type="button" onclick={() => insertVariableToBlock(block, 'buttonLabel', '{totalPrice}')} style="font-size: 0.65rem; padding: 0.05rem 0.3rem; background: #fefce8; border: 1px solid #fde047; color: #854d0e; border-radius: 3px; cursor: pointer;">+{'{totalPrice}'}</button>
                                                        </div>
                                                    </div>
                                                    <input
                                                        type="text"
                                                        class="form-input"
                                                        bind:value={block.buttonLabel}
                                                        placeholder="เช่น 🍵 สั่งเครื่องดื่มทันที"
                                                        style="font-size: 0.82rem; padding: 0.35rem 0.6rem; font-weight: 700; margin-top: 0.15rem;"
                                                    />
                                                </div>
                                                <div>
                                                    <span style="font-size: 0.72rem; color: #64748b; font-weight: 600;">สไตล์สีปุ่ม:</span>
                                                    <select
                                                        class="form-input"
                                                        bind:value={block.buttonStyle}
                                                        style="font-size: 0.8rem; padding: 0.35rem 0.5rem;"
                                                    >
                                                        <option value="primary">เขียวมัทฉะ (Primary)</option>
                                                        <option value="outline">ขาวขอบเขียว (Outline)</option>
                                                        <option value="gold">สีทอง (Gold)</option>
                                                        <option value="secondary">สีเทา (Secondary)</option>
                                                    </select>
                                                </div>
                                            </div>

                                            <div>
                                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem; flex-wrap: wrap; gap: 0.25rem;">
                                                    <span style="font-size: 0.72rem; color: #64748b; font-weight: 600;">ลิงก์หน้าเว็บ (Action URL):</span>
                                                    <div style="display: flex; gap: 0.25rem; flex-wrap: wrap;">
                                                        <button
                                                            type="button"
                                                            onclick={() => {
                                                                block.buttonUrl = 'https://homematchacafe.store/loyalty?action=register&phone={phone}';
                                                                if (!block.buttonLabel || block.buttonLabel.includes('สั่ง') || block.buttonLabel.includes('รายละเอียด')) {
                                                                    block.buttonLabel = '✨ สมัครสมาชิกสะสมแต้ม';
                                                                }
                                                                block.buttonStyle = 'gold';
                                                            }}
                                                            style="font-size: 0.68rem; padding: 0.15rem 0.45rem; background: #fdf2f8; border: 1px solid #fbcfe8; color: #9d174d; border-radius: 4px; cursor: pointer; font-weight: 800;"
                                                            title="ตั้งเป็นปุ่มสมัครสมาชิก ดึงเบอร์จาก LINE ไปกรอกให้อัตโนมัติ"
                                                        >
                                                            ✨ สมัครสมาชิก (+เบอร์)
                                                        </button>
                                                        <button type="button" onclick={() => (block.buttonUrl = 'https://homematchacafe.store/menu')} style="font-size: 0.68rem; padding: 0.15rem 0.35rem; background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; border-radius: 4px; cursor: pointer;">
                                                            /menu
                                                        </button>
                                                        <button type="button" onclick={() => (block.buttonUrl = 'https://homematchacafe.store/loyalty')} style="font-size: 0.68rem; padding: 0.15rem 0.35rem; background: #fefce8; border: 1px solid #fde047; color: #854d0e; border-radius: 4px; cursor: pointer;">
                                                            /loyalty
                                                        </button>
                                                        <button type="button" onclick={() => (block.buttonUrl = 'https://homematchacafe.store/order')} style="font-size: 0.68rem; padding: 0.15rem 0.35rem; background: #f0f9ff; border: 1px solid #bae6fd; color: #0284c7; border-radius: 4px; cursor: pointer;">
                                                            /order
                                                        </button>
                                                        <button type="button" onclick={() => insertVariableToBlock(block, 'buttonUrl', '{phone}')} style="font-size: 0.68rem; padding: 0.15rem 0.35rem; background: #fdf2f8; border: 1px solid #fbcfe8; color: #9d174d; border-radius: 4px; cursor: pointer;" title="แทรกตัวแปรเบอร์โทร">
                                                            +{'{phone}'}
                                                        </button>
                                                        <button type="button" onclick={() => insertVariableToBlock(block, 'buttonUrl', '{orderCode}')} style="font-size: 0.68rem; padding: 0.15rem 0.35rem; background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; border-radius: 4px; cursor: pointer;" title="แทรกตัวแปรรหัสออเดอร์">
                                                            +{'{orderCode}'}
                                                        </button>
                                                    </div>
                                                </div>
                                                <input
                                                    type="url"
                                                    class="form-input"
                                                    bind:value={block.buttonUrl}
                                                    placeholder="https://homematchacafe.store/..."
                                                    style="font-size: 0.82rem; padding: 0.35rem 0.6rem;"
                                                />
                                                {#if block.buttonUrl && block.buttonUrl.includes('{phone}')}
                                                    <span style="display: block; font-size: 0.7rem; color: #9d174d; margin-top: 0.2rem; font-weight: 600;">
                                                        💡 ระบบจะแทนที่ {'{phone}'} ด้วยเบอร์โทรที่ลูกค้าพิมพ์เข้ามาใน LINE และกรอกใส่ช่องสมัครสมาชิกให้อัตโนมัติ
                                                    </span>
                                                {/if}
                                            </div>
                                        </div>
                                    {/if}
                                </div>
                            {/each}
                        </div>

                        <!-- ปุ่มเพิ่มบล็อกใหม่ -->
                        <div style="background: #f1f5f9; border: 1.5px dashed #cbd5e1; border-radius: 12px; padding: 0.85rem; margin-top: 0.25rem;">
                            <span style="display: block; font-size: 0.8rem; font-weight: 700; color: #475569; margin-bottom: 0.5rem;">
                                ➕ เพิ่มส่วนประกอบใหม่ลงในการ์ด:
                            </span>
                            <div style="display: flex; flex-wrap: wrap; gap: 0.4rem;">
                                <button type="button" onclick={() => addDesignerBlock('banner')} style="padding: 0.35rem 0.65rem; font-size: 0.78rem; font-weight: 700; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; cursor: pointer;">
                                    🖼️ รูปแบนเนอร์
                                </button>
                                <button type="button" onclick={() => addDesignerBlock('tag')} style="padding: 0.35rem 0.65rem; font-size: 0.78rem; font-weight: 700; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; cursor: pointer;">
                                    🏷️ ป้ายแท็ก
                                </button>
                                <button type="button" onclick={() => addDesignerBlock('title')} style="padding: 0.35rem 0.65rem; font-size: 0.78rem; font-weight: 700; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; cursor: pointer;">
                                    📝 หัวข้อ
                                </button>
                                <button type="button" onclick={() => addDesignerBlock('body')} style="padding: 0.35rem 0.65rem; font-size: 0.78rem; font-weight: 700; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; cursor: pointer;">
                                    📄 คำอธิบาย
                                </button>
                                <button type="button" onclick={() => addDesignerBlock('highlight')} style="padding: 0.35rem 0.65rem; font-size: 0.78rem; font-weight: 700; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; cursor: pointer;">
                                    💰 ไฮไลต์/ราคา
                                </button>
                                <button type="button" onclick={() => addDesignerBlock('button')} style="padding: 0.35rem 0.65rem; font-size: 0.78rem; font-weight: 800; background: #166534; color: #ffffff; border: 1px solid #14532d; border-radius: 6px; cursor: pointer;">
                                    🔘 ปุ่มแอ็กชัน
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- ฝั่งขวา: Live LINE Mobile Preview & การส่ง -->
                    <div style="display: flex; flex-direction: column; gap: 1rem; position: sticky; top: 1rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <strong style="color: #14532d; font-size: 0.95rem; display: flex; align-items: center; gap: 0.35rem;">
                                📱 หน้าจอพรีวิวใน LINE (Live Preview)
                            </strong>
                            <span style="font-size: 0.75rem; background: #e2e8f0; color: #475569; padding: 0.15rem 0.5rem; border-radius: 6px; font-weight: 600;">
                                Flex Bubble
                            </span>
                        </div>

                        <!-- กรอบจำลองหน้าจอ LINE Chat -->
                        <div style="background: #849ebf; border-radius: 24px; padding: 1.25rem 1rem; box-shadow: 0 10px 25px rgba(0,0,0,0.15); max-width: 360px; margin: 0 auto; width: 100%;">
                            
                            <!-- ตัวการ์ด Flex Message สีขาว (จำลอง Flex Bubble ขนาด Mega ตามสเปก LINE 1:1) -->
                            <div style="background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.18);">
                                
                                <!-- 1. HERO BANNER (ขอบชนขอบ หรือจัดกึ่งกลางตามขนาดที่เลือก) -->
                                {#if designerHeroBlock}
                                    {@const imgSize = designerHeroBlock.imageSize || 'full'}
                                    {@const maxWidth = imgSize === 'full' ? '100%' : imgSize === '5xl' ? '280px' : imgSize === '4xl' ? '240px' : imgSize === '3xl' ? '200px' : imgSize === 'xxl' ? '160px' : imgSize === 'xl' ? '120px' : imgSize === 'lg' ? '80px' : '100%'}
                                    <div style="width: 100%; background: #f8fafc; display: flex; justify-content: center; align-items: center; position: relative; padding: {imgSize === 'full' ? '0' : '0.85rem 0'};">
                                        <div style="width: {maxWidth}; max-width: 100%; aspect-ratio: {designerHeroBlock.aspectRatio === '1:1' ? '1/1' : designerHeroBlock.aspectRatio === '16:9' ? '16/9' : designerHeroBlock.aspectRatio === '4:3' ? '4/3' : designerHeroBlock.aspectRatio === '3:2' ? '3/2' : designerHeroBlock.aspectRatio === '3:4' ? '3/4' : designerHeroBlock.aspectRatio === '9:16' ? '9/16' : '20/13'}; overflow: hidden; border-radius: {imgSize === 'full' ? '0' : '8px'};">
                                            <img
                                                src={designerHeroBlock.imageUrl}
                                                alt="Hero Mascot"
                                                style="width: 100%; height: 100%; object-fit: {designerHeroBlock.aspectMode || 'cover'}; display: block;"
                                                onerror={(e) => { (e.currentTarget as HTMLImageElement).src = 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?auto=format&fit=crop&w=800&q=80'; }}
                                            />
                                        </div>
                                        {#if imgSize === 'full'}
                                            <!-- จำลอง Badge วันนี้ ของแอป LINE บนหัวภาพ -->
                                            <div style="position: absolute; top: 8px; left: 50%; transform: translateX(-50%); background: #96a978; color: #ffffff; font-size: 0.65rem; font-weight: 700; padding: 0.1rem 0.55rem; border-radius: 999px; box-shadow: 0 1px 3px rgba(0,0,0,0.15);">
                                                วันนี้
                                            </div>
                                        {/if}
                                    </div>
                                {/if}

                                <!-- 2. BODY CONTAINER (PaddingAll: 20px ตามมาตรฐาน Flex Message) -->
                                {#if designerBodyBlocks.length > 0}
                                    <div style="padding: 20px 20px 14px 20px; display: flex; flex-direction: column; gap: 8px;">
                                        {#each designerBodyBlocks as b}
                                            {#if b.type === 'tag' && b.tagText}
                                                <div style="display: flex;">
                                                    <span style="display: inline-block; background: {b.tagBg || '#e0f2fe'}; color: {b.tagColor || '#0369a1'}; font-size: 0.72rem; font-weight: 800; padding: 0.22rem 0.65rem; border-radius: 999px;">
                                                        {b.tagText}
                                                    </span>
                                                </div>
                                            {:else if b.type === 'title' && b.titleText}
                                                <div>
                                                    <strong style="color: #14532d; font-size: {b.titleSize === 'xl' ? '1.25rem' : b.titleSize === 'md' ? '1rem' : '1.12rem'}; line-height: 1.35; display: block; font-weight: 800;">
                                                        {replacePreviewVars(b.titleText)}
                                                    </strong>
                                                </div>
                                            {:else if b.type === 'body' && b.bodyText}
                                                <div>
                                                    <p style="margin: 0; color: #475569; font-size: 0.85rem; line-height: 1.5; white-space: pre-line;">
                                                        {replacePreviewVars(b.bodyText)}
                                                    </p>
                                                </div>
                                            {:else if b.type === 'highlight' && b.highlightText}
                                                <div style="background: #fef3c7; border: 1.5px solid #fde047; border-radius: 8px; padding: 0.55rem 0.85rem; color: #92400e; font-size: 0.82rem; font-weight: 700; text-align: left; line-height: 1.45;">
                                                    {replacePreviewVars(b.highlightText)}
                                                </div>
                                            {/if}
                                        {/each}
                                    </div>
                                {/if}

                                <!-- 3. FOOTER CONTAINER (LINE Flex Buttons: ความสูง sm 38px, รัศมี 4px ตาม LINE Native Style) -->
                                {#if designerFooterBlocks.length > 0}
                                    <div style="padding: 6px 20px 18px 20px; display: flex; flex-direction: column; gap: 8px;">
                                        {#each designerFooterBlocks as b}
                                            <a
                                                href={b.buttonUrl || '#'}
                                                target="_blank"
                                                rel="noreferrer"
                                                style="
                                                    display: flex;
                                                    align-items: center;
                                                    justify-content: center;
                                                    text-align: center;
                                                    text-decoration: none;
                                                    height: 38px;
                                                    font-size: 0.86rem;
                                                    font-weight: 700;
                                                    border-radius: 4px;
                                                    background: {b.buttonStyle === 'outline' ? '#ffffff' : b.buttonStyle === 'gold' ? '#d97706' : b.buttonStyle === 'secondary' ? '#475569' : '#166534'};
                                                    color: {b.buttonStyle === 'outline' ? '#166534' : '#ffffff'};
                                                    border: {b.buttonStyle === 'outline' ? '1px solid #166534' : 'none'};
                                                    box-sizing: border-box;
                                                    letter-spacing: 0.01em;
                                                "
                                            >
                                                {b.buttonLabel}
                                            </a>
                                        {/each}
                                    </div>
                                {/if}

                                {#if !designerHeroBlock && designerBodyBlocks.length === 0 && designerFooterBlocks.length === 0}
                                    <div style="padding: 2.5rem 1rem; text-align: center; color: #94a3b8; font-size: 0.85rem;">
                                        ยังไม่มีเนื้อหาในการ์ด กรุณากดเพิ่มบล็อกจากฝั่งซ้ายค่ะ
                                    </div>
                                {/if}
                            </div>

                            <!-- เวลาจำลองใต้บอลลูน -->
                            <div style="text-align: right; margin-top: 0.35rem; padding-right: 0.25rem;">
                                <span style="font-size: 0.68rem; color: #ffffff; opacity: 0.85;">12:00</span>
                            </div>
                        </div>

                        <!-- กล่องตั้งเป็นการ์ดต้อนรับเมื่อเพิ่มเพื่อนใหม่ -->
                        <div style="background: {settings.lineOa.useCustomWelcomeCard ? '#f0fdf4' : '#ffffff'}; border: 1.5px solid {settings.lineOa.useCustomWelcomeCard ? '#86efac' : '#cbd5e1'}; border-radius: 12px; padding: 1rem; margin-bottom: 0.85rem; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                                <div style="display: flex; align-items: center; gap: 0.4rem;">
                                    <span style="font-size: 1.05rem;">👋</span>
                                    <strong style="font-size: 0.88rem; color: #1e293b;">การ์ดต้อนรับเมื่อเพิ่มเพื่อนใหม่</strong>
                                </div>
                                {#if settings.lineOa.useCustomWelcomeCard}
                                    <span style="font-size: 0.72rem; background: #22c55e; color: #ffffff; font-weight: 800; padding: 0.15rem 0.55rem; border-radius: 9999px;">
                                        ● กำลังใช้งานอยู่
                                    </span>
                                {:else}
                                    <span style="font-size: 0.72rem; background: #f1f5f9; color: #64748b; font-weight: 700; padding: 0.15rem 0.55rem; border-radius: 9999px; border: 1px solid #e2e8f0;">
                                        ○ ไม่ได้เปิดใช้
                                    </span>
                                {/if}
                            </div>
                            <p style="margin: 0 0 0.65rem 0; font-size: 0.78rem; color: #64748b; line-height: 1.45;">
                                ตั้งให้ระบบส่งการ์ดที่กำลังออกแบบอยู่นี้อัตโนมัติทันที เมื่อมีลูกค้ากดเพิ่มเพื่อนหรือสแกน QR Code เข้ามา
                            </p>
                            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                                <button
                                    type="button"
                                    onclick={setAsWelcomeCard}
                                    class="btn-matcha-primary"
                                    style="flex: 1; padding: 0.5rem 0.75rem; font-size: 0.82rem; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem; background: #166534;"
                                >
                                    {settings.lineOa.useCustomWelcomeCard ? '💾 อัปเดตการ์ดต้อนรับเพิ่มเพื่อน' : '⭐ ตั้งเป็นการ์ดต้อนรับเพิ่มเพื่อน'}
                                </button>
                                {#if settings.lineOa.useCustomWelcomeCard}
                                    <button
                                        type="button"
                                        onclick={unsetWelcomeCard}
                                        style="padding: 0.5rem 0.65rem; font-size: 0.78rem; font-weight: 700; background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; border-radius: 8px; cursor: pointer; white-space: nowrap;"
                                        title="ยกเลิกการใช้การ์ดและกลับไปใช้ข้อความตัวอักษรธรรมดา"
                                    >
                                        ปิดใช้การ์ด
                                    </button>
                                {/if}
                            </div>
                        </div>

                        <!-- กล่องตั้งเป็นการ์ดแจ้งเตือนสมาชิกเดิมเมื่อตรวจพบเบอร์ในระบบ -->
                        <div style="background: {settings.lineOa.useCustomMemberCard ? '#f0fdf4' : '#ffffff'}; border: 1.5px solid {settings.lineOa.useCustomMemberCard ? '#22c55e' : '#cbd5e1'}; border-radius: 12px; padding: 1rem; margin-bottom: 0.85rem; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                                <div style="display: flex; align-items: center; gap: 0.4rem;">
                                    <span style="font-size: 1.05rem;">🟢</span>
                                    <strong style="font-size: 0.88rem; color: #1e293b;">การ์ดสมาชิกเดิม (เมื่อพบเบอร์ในระบบ)</strong>
                                </div>
                                {#if settings.lineOa.useCustomMemberCard}
                                    <span style="font-size: 0.72rem; background: #166534; color: #ffffff; font-weight: 800; padding: 0.15rem 0.55rem; border-radius: 9999px;">
                                        ● กำลังใช้งานอยู่
                                    </span>
                                {:else}
                                    <span style="font-size: 0.72rem; background: #f1f5f9; color: #64748b; font-weight: 700; padding: 0.15rem 0.55rem; border-radius: 9999px; border: 1px solid #e2e8f0;">
                                        ○ การ์ดเริ่มต้น
                                    </span>
                                {/if}
                            </div>
                            <p style="margin: 0 0 0.5rem 0; font-size: 0.78rem; color: #64748b; line-height: 1.45;">
                                ตั้งให้ระบบส่งการ์ดที่กำลังออกแบบอยู่นี้ เมื่อลูกค้าพิมพ์เบอร์ 10 หลักที่ตรวจพบว่าเป็นสมาชิกในระบบแล้ว เพื่อยืนยันการเชื่อมต่อ LINE และโชว์แต้มสะสม
                            </p>
                            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                                <button
                                    type="button"
                                    onclick={setAsMemberCard}
                                    class="btn-matcha-primary"
                                    style="flex: 1; padding: 0.5rem 0.75rem; font-size: 0.82rem; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem; background: #15803d;"
                                >
                                    {settings.lineOa.useCustomMemberCard ? '💾 อัปเดตการ์ดสมาชิกเดิม' : '⭐ ตั้งเป็นการ์ดสมาชิกเดิม'}
                                </button>
                                {#if settings.lineOa.useCustomMemberCard}
                                    <button
                                        type="button"
                                        onclick={unsetMemberCard}
                                        style="padding: 0.5rem 0.65rem; font-size: 0.78rem; font-weight: 700; background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; border-radius: 8px; cursor: pointer; white-space: nowrap;"
                                        title="ยกเลิกการใช้การ์ดและกลับไปใช้การ์ดเริ่มต้นของระบบ"
                                    >
                                        ปิดใช้การ์ด
                                    </button>
                                {/if}
                            </div>
                        </div>

                        <!-- กล่องตั้งเป็นการ์ดชวนสมัครสมาชิกเมื่อพิมพ์เบอร์ใหม่ -->
                        <div style="background: {settings.lineOa.useCustomRegisterCard ? '#fdf2f8' : '#ffffff'}; border: 1.5px solid {settings.lineOa.useCustomRegisterCard ? '#f472b6' : '#cbd5e1'}; border-radius: 12px; padding: 1rem; margin-bottom: 0.85rem; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                                <div style="display: flex; align-items: center; gap: 0.4rem;">
                                    <span style="font-size: 1.05rem;">✨</span>
                                    <strong style="font-size: 0.88rem; color: #1e293b;">การ์ดชวนสมัครสมาชิก (เมื่อพิมพ์เบอร์ใหม่)</strong>
                                </div>
                                {#if settings.lineOa.useCustomRegisterCard}
                                    <span style="font-size: 0.72rem; background: #db2777; color: #ffffff; font-weight: 800; padding: 0.15rem 0.55rem; border-radius: 9999px;">
                                        ● กำลังใช้งานอยู่
                                    </span>
                                {:else}
                                    <span style="font-size: 0.72rem; background: #f1f5f9; color: #64748b; font-weight: 700; padding: 0.15rem 0.55rem; border-radius: 9999px; border: 1px solid #e2e8f0;">
                                        ○ การ์ดเริ่มต้น
                                    </span>
                                {/if}
                            </div>
                            <p style="margin: 0 0 0.5rem 0; font-size: 0.78rem; color: #64748b; line-height: 1.45;">
                                ตั้งให้ระบบส่งการ์ดที่กำลังออกแบบอยู่นี้ เมื่อลูกค้าพิมพ์เบอร์โทรศัพท์ 10 หลักที่ยังไม่ได้สมัครสมาชิก โดยระบบจะดึงเบอร์ไปกรอกในหน้าสมัครให้อัตโนมัติ
                            </p>
                            <div style="background: rgba(255,255,255,0.7); border: 1px solid #fbcfe8; border-radius: 8px; padding: 0.45rem 0.65rem; margin-bottom: 0.65rem;">
                                <label style="display: flex; align-items: center; gap: 0.45rem; font-size: 0.8rem; font-weight: 700; color: #831843; cursor: pointer;">
                                    <input
                                        type="checkbox"
                                        bind:checked={settings.lineOa.notifyOnPhoneLinked}
                                        style="width: 16px; height: 16px; accent-color: #be185d;"
                                    />
                                    <span>เปิดส่งการ์ดตอบกลับหลังได้เบอร์ (Event ได้เบอร์)</span>
                                </label>
                            </div>
                            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                                <button
                                    type="button"
                                    onclick={setAsRegisterCard}
                                    class="btn-matcha-primary"
                                    style="flex: 1; padding: 0.5rem 0.75rem; font-size: 0.82rem; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem; background: #be185d;"
                                >
                                    {settings.lineOa.useCustomRegisterCard ? '💾 อัปเดตการ์ดชวนสมัครสมาชิก' : '⭐ ตั้งเป็นการ์ดชวนสมัครสมาชิก'}
                                </button>
                                {#if settings.lineOa.useCustomRegisterCard}
                                    <button
                                        type="button"
                                        onclick={unsetRegisterCard}
                                        style="padding: 0.5rem 0.65rem; font-size: 0.78rem; font-weight: 700; background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; border-radius: 8px; cursor: pointer; white-space: nowrap;"
                                        title="ยกเลิกการใช้การ์ดและกลับไปใช้การ์ดเริ่มต้นของระบบ"
                                    >
                                        ปิดใช้การ์ด
                                    </button>
                                {/if}
                            </div>
                        </div>

                        <!-- กล่องตั้งเป็นการ์ดแจ้งเตือนสถานะออเดอร์ -->
                        <div style="background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 12px; padding: 1rem; margin-bottom: 0.85rem; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                                <div style="display: flex; align-items: center; gap: 0.4rem;">
                                    <span style="font-size: 1.05rem;">📢</span>
                                    <strong style="font-size: 0.88rem; color: #1e293b;">ตั้งเป็นการ์ดแจ้งเตือนสถานะออเดอร์</strong>
                                </div>
                                <span style="font-size: 0.72rem; color: #64748b;">
                                    💡 แทนค่า: {'{orderCode}'}, {'{itemsSummary}'}, {'{url}'}
                                </span>
                            </div>
                            <p style="margin: 0 0 0.65rem 0; font-size: 0.78rem; color: #64748b; line-height: 1.45;">
                                เลือกสถานะที่ต้องการนำการ์ดที่กำลังออกแบบอยู่นี้ไปใช้ส่งแจ้งเตือนลูกค้าทาง LINE แทนการ์ดมาตรฐานของระบบค่ะ:
                            </p>
                            
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 0.5rem; margin-bottom: 0.5rem;">
                                {#each [
                                    { key: 'order_created', name: '📝 รับออเดอร์', color: '#166534' },
                                    { key: 'member_registered', name: '🎉 สมัครสมาชิก', color: '#831843' },
                                    { key: 'slip_approved', name: '💳 อนุมัติสลิป', color: '#15803d' },
                                    { key: 'brewing', name: '🍵 กำลังชง', color: '#0d9488' },
                                    { key: 'ready_to_ship', name: '✨ ชงเสร็จ', color: '#059669' },
                                    { key: 'delivering', name: '🛵 กำลังส่ง', color: '#0284c7' },
                                    { key: 'completed', name: '🎉 ส่งสำเร็จ', color: '#166534' },
                                    { key: 'cancelled', name: '❌ ยกเลิก', color: '#dc2626' }
                                ] as stItem}
                                    <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                                        <button
                                            type="button"
                                            onclick={() => setAsStatusCard(stItem.key as any)}
                                            style="padding: 0.4rem 0.5rem; font-size: 0.78rem; font-weight: 700; background: {settings.lineOa.customStatusCards?.[stItem.key]?.enabled ? stItem.color : '#ffffff'}; color: {settings.lineOa.customStatusCards?.[stItem.key]?.enabled ? '#ffffff' : stItem.color}; border: 1.5px solid {stItem.color}; border-radius: 6px; cursor: pointer;"
                                            title="ตั้งการ์ดที่กำลังออกแบบอยู่นี้เป็น: {stItem.name}"
                                        >
                                            {stItem.name} {settings.lineOa.customStatusCards?.[stItem.key]?.enabled ? '✓' : ''}
                                        </button>
                                        {#if settings.lineOa.customStatusCards?.[stItem.key]?.enabled}
                                            <button
                                                type="button"
                                                onclick={() => loadSavedStatusCard(stItem.key)}
                                                style="padding: 0.2rem 0.4rem; font-size: 0.7rem; font-weight: 700; background: #f0fdfa; color: #0d9488; border: 1px dashed #0d9488; border-radius: 4px; cursor: pointer; text-align: center;"
                                                title="ดึงการ์ดนี้กลับมาแก้ไขใน Designer"
                                            >
                                                📂 ดึงมาแก้ไข
                                            </button>
                                        {/if}
                                    </div>
                                {/each}
                            </div>

                            {#if Object.values(settings.lineOa.customStatusCards || {}).some(c => c?.enabled)}
                                <div style="display: flex; gap: 0.4rem; flex-wrap: wrap; align-items: center; border-top: 1px dashed #cbd5e1; padding-top: 0.5rem; font-size: 0.72rem; color: #475569;">
                                    <span>สลับกลับใช้การ์ดระบบ:</span>
                                    {#each ['order_created', 'member_registered', 'slip_approved', 'brewing', 'ready_to_ship', 'delivering', 'completed', 'cancelled'] as st}
                                        {#if settings.lineOa.customStatusCards?.[st]?.enabled}
                                            <button
                                                type="button"
                                                onclick={() => unsetStatusCard(st)}
                                                style="padding: 0.15rem 0.45rem; font-size: 0.7rem; background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; border-radius: 4px; cursor: pointer;"
                                            >
                                                รีเซ็ต {st === 'order_created' ? 'รับออเดอร์' : st === 'member_registered' ? 'สมัครสมาชิก' : st === 'slip_approved' ? 'อนุมัติสลิป' : st === 'brewing' ? 'กำลังชง' : st === 'ready_to_ship' ? 'ชงเสร็จ' : st === 'delivering' ? 'กำลังส่ง' : st === 'completed' ? 'ส่งสำเร็จ' : 'ยกเลิก'}
                                            </button>
                                        {/if}
                                    {/each}
                                </div>
                            {/if}
                        </div>

                        <!-- กล่องกำหนดตัวแปรทดสอบ (Test Variables) -->
                        <div style="background: #ffffff; border: 1.5px solid #cbd5e1; border-radius: 12px; padding: 0.85rem 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
                            <div style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;" onclick={() => (showTestVars = !showTestVars)}>
                                <strong style="font-size: 0.85rem; color: #1e293b; display: flex; align-items: center; gap: 0.35rem;">
                                    🧪 ตั้งค่าตัวแปรจำลองสำหรับทดสอบ (Test Variables)
                                </strong>
                                <span style="font-size: 0.72rem; color: #0284c7; font-weight: 700;">
                                    {showTestVars ? '▲ ย่อเก็บ' : '▼ กำหนดค่าทดสอบ'}
                                </span>
                            </div>

                            {#if showTestVars}
                                <div style="margin-top: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem; border-top: 1px dashed #cbd5e1; padding-top: 0.75rem;">
                                    <div style="font-size: 0.72rem; color: #64748b;">
                                        กำหนดค่าที่จะนำไปแทนที่ในข้อความตัวอย่าง ({'{orderCode}'}, {'{itemsSummary}'}, ฯลฯ) ทั้งบนหน้าจอ Live Preview และตอนกดส่งทดสอบเข้า LINE:
                                    </div>
                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                                        <div>
                                            <label style="font-size: 0.72rem; font-weight: 700; color: #475569; display: block; margin-bottom: 0.15rem;">
                                                {'{orderCode}'} รหัสออเดอร์:
                                            </label>
                                            <input type="text" class="form-input" bind:value={testVars.orderCode} placeholder="เช่น HM-8899" style="font-size: 0.8rem; padding: 0.25rem 0.5rem;" />
                                        </div>
                                        <div>
                                            <label style="font-size: 0.72rem; font-weight: 700; color: #475569; display: block; margin-bottom: 0.15rem;">
                                                {'{totalPrice}'} ยอดเงิน:
                                            </label>
                                            <input type="text" class="form-input" bind:value={testVars.totalPrice} placeholder="เช่น ฿165" style="font-size: 0.8rem; padding: 0.25rem 0.5rem;" />
                                        </div>
                                    </div>

                                    <div>
                                        <label style="font-size: 0.72rem; font-weight: 700; color: #475569; display: block; margin-bottom: 0.15rem;">
                                            {'{itemsSummary}'} รายการสินค้า (Item Summary):
                                        </label>
                                        <textarea
                                            class="form-input"
                                            bind:value={testVars.itemsSummary}
                                            rows="2"
                                            placeholder="เช่น 🍵 Cold-Fermented Oat Milk Matcha Latte x1&#10;🍵 Clear Matcha Cold Whisk x1"
                                            style="font-size: 0.8rem; padding: 0.3rem 0.5rem; width: 100%; resize: vertical; line-height: 1.4;"
                                        ></textarea>
                                    </div>

                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                                        <div>
                                            <label style="font-size: 0.72rem; font-weight: 700; color: #475569; display: block; margin-bottom: 0.15rem;">
                                                {'{customerName}'} ชื่อลูกค้า:
                                            </label>
                                            <input type="text" class="form-input" bind:value={testVars.customerName} placeholder="เช่น คุณลูกค้า" style="font-size: 0.8rem; padding: 0.25rem 0.5rem;" />
                                        </div>
                                        <div>
                                            <label style="font-size: 0.72rem; font-weight: 700; color: #475569; display: block; margin-bottom: 0.15rem;">
                                                {'{phone}'} เบอร์โทร:
                                            </label>
                                            <input type="text" class="form-input" bind:value={testVars.phone} placeholder="เช่น 0812345678" style="font-size: 0.8rem; padding: 0.25rem 0.5rem;" />
                                        </div>
                                    </div>

                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                                        <div>
                                            <label style="font-size: 0.72rem; font-weight: 700; color: #475569; display: block; margin-bottom: 0.15rem;">
                                                {'{pin}'} รหัส PIN สมาชิก:
                                            </label>
                                            <input type="text" class="form-input" bind:value={testVars.pin} placeholder="เช่น 1234" style="font-size: 0.8rem; padding: 0.25rem 0.5rem;" />
                                        </div>
                                        <div>
                                            <label style="font-size: 0.72rem; font-weight: 700; color: #475569; display: block; margin-bottom: 0.15rem;">
                                                {'{points}'} คะแนนสะสม:
                                            </label>
                                            <input type="text" class="form-input" bind:value={testVars.points} placeholder="เช่น 10" style="font-size: 0.8rem; padding: 0.25rem 0.5rem;" />
                                        </div>
                                    </div>

                                    <div style="text-align: right;">
                                        <button
                                            type="button"
                                            onclick={() => {
                                                testVars.orderCode = 'HM-8899';
                                                testVars.itemsSummary = '🍵 Cold-Fermented Oat Milk Matcha Latte x1\n🍵 Clear Matcha Cold Whisk x1';
                                                testVars.totalPrice = '฿165';
                                                testVars.customerName = 'คุณลูกค้า';
                                                testVars.phone = '0812345678';
                                                testVars.points = '10';
                                                testVars.pin = '1234';
                                            }}
                                            style="background: none; border: none; font-size: 0.7rem; color: #64748b; cursor: pointer; text-decoration: underline;"
                                        >
                                            ↺ รีเซ็ตค่าตัวแปรทดสอบ
                                        </button>
                                    </div>
                                </div>
                            {/if}
                        </div>

                        <!-- กล่องส่งข้อความ & Export -->
                        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; padding: 1rem;">
                            <div style="margin-bottom: 0.65rem;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                                    <span style="font-size: 0.75rem; color: #475569; font-weight: 700;">
                                        ข้อความแจ้งเตือน (Alt Text บนหน้าจอมือถือ):
                                    </span>
                                    <div style="display: flex; gap: 0.2rem;">
                                        <button type="button" onclick={() => (designerAltText = (designerAltText || '') + (designerAltText ? ' ' : '') + '{orderCode}')} style="font-size: 0.65rem; padding: 0.05rem 0.3rem; background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; border-radius: 3px; cursor: pointer;">+{'{orderCode}'}</button>
                                        <button type="button" onclick={() => (designerAltText = (designerAltText || '') + (designerAltText ? ' ' : '') + '{totalPrice}')} style="font-size: 0.65rem; padding: 0.05rem 0.3rem; background: #fefce8; border: 1px solid #fde047; color: #854d0e; border-radius: 3px; cursor: pointer;">+{'{totalPrice}'}</button>
                                    </div>
                                </div>
                                <input
                                    type="text"
                                    class="form-input"
                                    bind:value={designerAltText}
                                    placeholder="เช่น 🍵 Home Matcha Cafe มีโปรโมชั่นใหม่!"
                                    style="font-size: 0.82rem; padding: 0.35rem 0.65rem;"
                                />
                            </div>

                            <div style="margin-bottom: 0.85rem;">
                                <span style="font-size: 0.75rem; color: #475569; font-weight: 700; display: block; margin-bottom: 0.25rem;">
                                    เป้าหมายการส่ง:
                                </span>
                                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                                    <label style="display: flex; align-items: center; gap: 0.35rem; font-size: 0.82rem; font-weight: 700; color: #166534; cursor: pointer;">
                                        <input type="radio" bind:group={designerTarget} value="admin" style="accent-color: #166534;" />
                                        📱 ส่งทดสอบเข้า LINE แอดมิน
                                    </label>
                                    <label style="display: flex; align-items: center; gap: 0.35rem; font-size: 0.82rem; font-weight: 700; color: #0284c7; cursor: pointer;">
                                        <input type="radio" bind:group={designerTarget} value="broadcast" style="accent-color: #0284c7;" />
                                        📢 ส่งบรอดแคสต์หาลูกค้าทุกคน
                                    </label>
                                </div>
                            </div>

                            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                                <button
                                    type="button"
                                    onclick={sendDesignerCard}
                                    disabled={isSendingDesignerCard}
                                    class="btn-matcha-primary"
                                    style="flex: 1; padding: 0.55rem 0.9rem; font-size: 0.88rem; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem;"
                                >
                                    🚀 {isSendingDesignerCard ? 'กำลังส่ง...' : designerTarget === 'admin' ? 'ส่งทดสอบเข้า LINE แอดมิน' : 'บรอดแคสต์ส่งหาลูกค้าทุกคน'}
                                </button>
                                <button
                                    type="button"
                                    onclick={copyDesignerFlexJson}
                                    class="btn-matcha-outline"
                                    style="padding: 0.55rem 0.85rem; font-size: 0.82rem; font-weight: 700; white-space: nowrap;"
                                    title="คัดลอก JSON โค้ด Flex เพื่อนำไปใช้ต่อ"
                                >
                                    📋 คัดลอก JSON
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
                </div>
            {/if}

            <!-- 5. หมวด: สมาชิก LINE & ริชเมนู -->
            {#if lineOaSubTab === 'users'}
                <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                    <!-- กล่องที่ 7: 📱 คำแนะนำและวิธีทำ "เมนูรูปภาพด้านล่าง (LINE Rich Menu)" -->
            <div class="info-card" style="padding: 1.5rem; background: #ffffff; border: 1.5px solid #cbd5e1; border-radius: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1rem;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                            <span style="background: #0284c7; color: #ffffff; font-size: 0.75rem; font-weight: 800; padding: 0.2rem 0.55rem; border-radius: 6px;">
                                LINE Rich Menu Guide
                            </span>
                            <span style="background: #e0f2fe; color: #0369a1; font-size: 0.75rem; font-weight: 700; padding: 0.2rem 0.55rem; border-radius: 6px;">
                                เมนูกราฟิกตรึงล่างแชท
                            </span>
                        </div>
                        <h3 style="margin: 0; font-size: 1.25rem; color: #0c4a6e; font-weight: 800;">
                            📱 7. วิธีทำเมนูรูปภาพด้านล่างเหมือนร้านค้าอื่นๆ (LINE Rich Menu)
                        </h3>
                        <p style="margin: 0.25rem 0 0 0; font-size: 0.85rem; color: #64748b;">
                            เมนูกราฟิกด้านล่างหน้าต่างแชท (Rich Menu) คือเครื่องมือที่ดีที่สุดในการให้ลูกค้ากดสั่งซื้อ ตรวจแต้ม หรือเช็คสถานะได้ทันทีโดยไม่ต้องพิมพ์
                        </p>
                    </div>

                    <a
                        href="https://manager.line.biz"
                        target="_blank"
                        rel="noreferrer"
                        class="btn-matcha-primary"
                        style="padding: 0.5rem 1rem; font-size: 0.85rem; text-decoration: none; font-weight: 800; background: #0284c7; display: inline-flex; align-items: center; gap: 0.35rem;"
                    >
                        🌐 เปิด LINE OA Manager ↗
                    </a>
                </div>

                <!-- 3 ขั้นตอนการทำ -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin-bottom: 1.25rem;">
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem;">
                        <div style="font-size: 1.1rem; font-weight: 800; color: #0284c7; margin-bottom: 0.35rem;">
                            1. ออกแบบรูปภาพ (Canva) 🎨
                        </div>
                        <p style="font-size: 0.82rem; color: #475569; margin: 0; line-height: 1.5;">
                            เข้าไปที่ <strong>Canva.com</strong> แล้วค้นหาคำว่า <em>"LINE Rich Menu"</em> จะมีขนาดมาตรฐานให้เลือก:<br/>
                            • แบบใหญ่ (6 หรือ 4 ช่อง): <strong>2500 × 1686 px</strong><br/>
                            • แบบกะทัดรัด (3 ช่อง): <strong>2500 × 843 px</strong>
                        </p>
                    </div>

                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem;">
                        <div style="font-size: 1.1rem; font-weight: 800; color: #166534; margin-bottom: 0.35rem;">
                            2. ไปที่ LINE OA Manager ⚙️
                        </div>
                        <p style="font-size: 0.82rem; color: #475569; margin: 0; line-height: 1.5;">
                            เข้าเว็บ <a href="https://manager.line.biz" target="_blank" rel="noreferrer" style="color: #0284c7; font-weight: 700;">manager.line.biz</a> เลือกร้าน <strong>HOMEMATCHA'CAFE 🍵</strong><br/>
                            • เมนูซ้ายมือ เลือก <strong>"ริชเมนู" (Rich Menus)</strong><br/>
                            • กดปุ่ม <strong>"สร้างริชเมนู" (Create)</strong> และอัปโหลดรูปภาพที่เตรียมไว้
                        </p>
                    </div>

                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem;">
                        <div style="font-size: 1.1rem; font-weight: 800; color: #92400e; margin-bottom: 0.35rem;">
                            3. กำหนด Action แต่ละช่อง 🔗
                        </div>
                        <p style="font-size: 0.82rem; color: #475569; margin: 0; line-height: 1.5;">
                            กำหนดพื้นที่การคลิกให้ตรงกับปุ่มในรูปภาพ แล้วใส่ลิงก์หรือข้อความที่แนะนำตามตารางด้านล่างได้เลย ลูกค้าแตะแล้วจะเปิดเว็บหรือบอทจะตอบทันที!
                        </p>
                    </div>
                </div>

                <!-- ตารางค่า Action ที่แนะนำสำหรับร้าน Home Matcha Cafe -->
                <div style="background: #fffdf5; border: 1.5px solid #fde047; border-radius: 12px; padding: 1rem;">
                    <strong style="color: #854d0e; font-size: 0.92rem; display: block; margin-bottom: 0.6rem;">
                        📋 ค่า Action ที่แนะนำสำหรับใส่ในแต่ละช่องของริชเมนูร้านเรา (คลิกเพื่อคัดลอกได้ทันที):
                    </strong>

                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 0.65rem;">
                        <!-- ช่อง 1: สั่งซื้อ -->
                        <div style="background: #ffffff; border: 1px solid #fef08a; border-radius: 8px; padding: 0.65rem 0.8rem;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                                <strong style="color: #166534; font-size: 0.85rem;">🍵 ช่อง 1: สั่งเครื่องดื่ม / เมนู</strong>
                                <span style="font-size: 0.7rem; background: #dcfce7; color: #166534; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 700;">ประเภท: ลิงก์ (Link)</span>
                            </div>
                            <div style="display: flex; gap: 0.4rem; align-items: center;">
                                <code style="font-size: 0.78rem; background: #f1f5f9; padding: 0.2rem 0.4rem; border-radius: 4px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">https://homematchacafe.store/menu</code>
                                <button type="button" onclick={() => { navigator.clipboard.writeText('https://homematchacafe.store/menu'); swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'คัดลอกลิงก์สำเร็จ', timer: 1500, showConfirmButton: false }); }} style="padding: 0.2rem 0.5rem; font-size: 0.75rem; background: #166534; color: #fff; border: none; border-radius: 4px; cursor: pointer; white-space: nowrap;">คัดลอก</button>
                            </div>
                        </div>

                        <!-- ช่อง 2: สถานะ -->
                        <div style="background: #ffffff; border: 1px solid #fef08a; border-radius: 8px; padding: 0.65rem 0.8rem;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                                <strong style="color: #0369a1; font-size: 0.85rem;">🔍 ช่อง 2: เช็คสถานะออเดอร์</strong>
                                <span style="font-size: 0.7rem; background: #e0f2fe; color: #0369a1; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 700;">ประเภท: ข้อความ (Text)</span>
                            </div>
                            <div style="display: flex; gap: 0.4rem; align-items: center;">
                                <code style="font-size: 0.78rem; background: #f1f5f9; padding: 0.2rem 0.4rem; border-radius: 4px; flex: 1;">สถานะ</code>
                                <button type="button" onclick={() => { navigator.clipboard.writeText('สถานะ'); swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'คัดลอกคำว่า "สถานะ" แล้ว', timer: 1500, showConfirmButton: false }); }} style="padding: 0.2rem 0.5rem; font-size: 0.75rem; background: #0284c7; color: #fff; border: none; border-radius: 4px; cursor: pointer; white-space: nowrap;">คัดลอก</button>
                            </div>
                        </div>

                        <!-- ช่อง 3: สะสมแต้ม -->
                        <div style="background: #ffffff; border: 1px solid #fef08a; border-radius: 8px; padding: 0.65rem 0.8rem;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                                <strong style="color: #854d0e; font-size: 0.85rem;">⭐ ช่อง 3: บัตรสะสมแต้ม</strong>
                                <span style="font-size: 0.7rem; background: #fefce8; color: #854d0e; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 700;">ประเภท: ลิงก์ (Link)</span>
                            </div>
                            <div style="display: flex; gap: 0.4rem; align-items: center;">
                                <code style="font-size: 0.78rem; background: #f1f5f9; padding: 0.2rem 0.4rem; border-radius: 4px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">https://homematchacafe.store/loyalty</code>
                                <button type="button" onclick={() => { navigator.clipboard.writeText('https://homematchacafe.store/loyalty'); swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'คัดลอกลิงก์สำเร็จ', timer: 1500, showConfirmButton: false }); }} style="padding: 0.2rem 0.5rem; font-size: 0.75rem; background: #d97706; color: #fff; border: none; border-radius: 4px; cursor: pointer; white-space: nowrap;">คัดลอก</button>
                            </div>
                        </div>

                        <!-- ช่อง 4: เวลาส่ง -->
                        <div style="background: #ffffff; border: 1px solid #fef08a; border-radius: 8px; padding: 0.65rem 0.8rem;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                                <strong style="color: #475569; font-size: 0.85rem;">⏰ ช่อง 4: รอบจัดส่งของร้าน</strong>
                                <span style="font-size: 0.7rem; background: #f1f5f9; color: #475569; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 700;">ประเภท: ข้อความ (Text)</span>
                            </div>
                            <div style="display: flex; gap: 0.4rem; align-items: center;">
                                <code style="font-size: 0.78rem; background: #f1f5f9; padding: 0.2rem 0.4rem; border-radius: 4px; flex: 1;">เวลาส่ง</code>
                                <button type="button" onclick={() => { navigator.clipboard.writeText('เวลาส่ง'); swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'คัดลอกคำว่า "เวลาส่ง" แล้ว', timer: 1500, showConfirmButton: false }); }} style="padding: 0.2rem 0.5rem; font-size: 0.75rem; background: #475569; color: #fff; border: none; border-radius: 4px; cursor: pointer; white-space: nowrap;">คัดลอก</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
                    <!-- กล่องที่ 8: บัญชี LINE ที่เชื่อมต่อแล้ว (Connected LINE Users) -->
            <div class="info-card" style="padding: 1.5rem; background: #ffffff; border: 1px solid #cbd5e1;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1rem;">
                    <div>
                        <h3 style="margin: 0 0 0.25rem 0; font-size: 1.15rem; color: #14532d; font-weight: 800;">
                            👥 8. บัญชี LINE ที่เชื่อมต่อแล้ว ({lineUsersList.length} บัญชี)
                        </h3>
                        <p style="margin: 0; font-size: 0.85rem; color: #64748b;">
                            ลูกค้าที่ได้กดเพิ่มเพื่อนกับ LINE OA หรือพิมพ์เบอร์โทรศัพท์เพื่อผูกรับการแจ้งเตือน
                        </p>
                    </div>

                    <button
                        type="button"
                        onclick={loadLineUsers}
                        disabled={isLoadingLineUsers}
                        class="btn-matcha-outline"
                        style="padding: 0.45rem 0.9rem; font-size: 0.82rem;"
                    >
                        🔄 {isLoadingLineUsers ? 'กำลังโหลด...' : 'รีเฟรชรายชื่อ'}
                    </button>
                </div>

                {#if lineUsersList.length === 0}
                    <div style="text-align: center; padding: 2rem; color: #94a3b8; font-size: 0.88rem; background: #f8fafc; border-radius: 10px;">
                        ยังไม่มีผู้ใช้ LINE เชื่อมต่อเข้ามาค่ะ เมื่อมีลูกค้าแอด LINE OA รายชื่อจะปรากฏที่นี่อัตโนมัติ 🍵
                    </div>
                {:else}
                    <div style="overflow-x: auto;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                            <thead>
                                <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1; text-align: left;">
                                    <th style="padding: 0.65rem 0.85rem; color: #334155;">ผู้ใช้ LINE</th>
                                    <th style="padding: 0.65rem 0.85rem; color: #334155;">LINE User ID</th>
                                    <th style="padding: 0.65rem 0.85rem; color: #334155;">เบอร์โทรศัพท์</th>
                                    <th style="padding: 0.65rem 0.85rem; color: #334155;">สมาชิกในระบบ</th>
                                    <th style="padding: 0.65rem 0.85rem; color: #334155;">แต้มสะสม</th>
                                    <th style="padding: 0.65rem 0.85rem; text-align: right; color: #334155;">เชื่อมต่อเมื่อ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each lineUsersList as u (u.line_user_id)}
                                    <tr style="border-bottom: 1px solid #e2e8f0;">
                                        <td style="padding: 0.65rem 0.85rem;">
                                            <div style="display: flex; align-items: center; gap: 0.6rem;">
                                                {#if u.picture_url}
                                                    <img
                                                        src={u.picture_url}
                                                        alt={u.display_name}
                                                        style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;"
                                                    />
                                                {:else}
                                                    <img
                                                        src="/image/line-logo.png"
                                                        alt="LINE"
                                                        style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;"
                                                    />
                                                {/if}
                                                <strong style="color: #1e293b;">{u.display_name || 'ไม่ระบุชื่อ'}</strong>
                                            </div>
                                        </td>
                                        <td style="padding: 0.65rem 0.85rem; font-family: monospace; font-size: 0.78rem; color: #64748b;">
                                            <div style="display: flex; align-items: center; gap: 0.45rem;">
                                                <span title={u.line_user_id}>{u.line_user_id.slice(0, 10)}...{u.line_user_id.slice(-6)}</span>
                                                <button
                                                    type="button"
                                                    onclick={() => copyToClipboard(u.line_user_id, 'คัดลอก LINE User ID สำเร็จแล้ว 📋')}
                                                    style="padding: 0.15rem 0.45rem; font-size: 0.7rem; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer; color: #334155; display: inline-flex; align-items: center; gap: 0.2rem;"
                                                    title="คลิกเพื่อคัดลอก LINE User ID ทั้งหมด"
                                                >
                                                    📋 คัดลอก
                                                </button>
                                            </div>
                                        </td>
                                        <td style="padding: 0.65rem 0.85rem; font-weight: 700; color: #166534;">
                                            {u.phone || '-'}
                                        </td>
                                        <td style="padding: 0.65rem 0.85rem; color: #334155;">
                                            {u.member_name || (u.phone ? 'ไม่ได้สมัครสมาชิก' : 'ยังไม่ผูกเบอร์')}
                                        </td>
                                        <td style="padding: 0.65rem 0.85rem;">
                                            {#if u.member_stamps !== null && u.member_stamps !== undefined}
                                                <span style="background: #fef3c7; color: #b45309; padding: 0.15rem 0.5rem; border-radius: 999px; font-weight: 800; font-size: 0.78rem;">
                                                    ⭐ {u.member_stamps} ดวง
                                                </span>
                                            {:else}
                                                <span style="color: #94a3b8;">-</span>
                                            {/if}
                                        </td>
                                        <td style="padding: 0.65rem 0.85rem; text-align: right; color: #64748b; font-size: 0.78rem;">
                                            {formatTime(u.updated_at || u.created_at)}
                                        </td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                {/if}
            </div>
                </div>
            {/if}

            <!-- ปุ่มบันทึกการตั้งค่า LINE OA ทั้งหมด (Sticky Bottom) -->
            <div style="position: sticky; bottom: 1.5rem; z-index: 1000; width: 100%; display: flex; justify-content: flex-end;">
                <button 
                    type="button" 
                    onclick={saveAllSettings} 
                    class="btn-matcha-primary" 
                    style="padding: 1rem 2.5rem; font-size: 1.15rem; font-weight: 800; border-radius: 999px; box-shadow: 0 10px 30px rgba(52, 84, 39, 0.4);"
                    disabled={isSavingSettings}
                >
                    💾 {isSavingSettings ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า LINE OA ทั้งหมด'}
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
                                            <div style="display: flex; align-items: center; gap: 0.55rem;">
                                                {#if member.pictureUrl}
                                                    <img
                                                        src={member.pictureUrl}
                                                        alt={member.fullName}
                                                        style="width: 32px; height: 32px; min-width: 32px; min-height: 32px; border-radius: 50%; object-fit: cover; flex-shrink: 0;"
                                                    />
                                                {:else}
                                                    <div style="width: 32px; height: 32px; min-width: 32px; min-height: 32px; border-radius: 50%; background: linear-gradient(135deg, #e2e8f0, #cbd5e1); color: #475569; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; font-weight: 800; flex-shrink: 0;">
                                                        {(member.firstName || 'M').charAt(0).toUpperCase()}
                                                    </div>
                                                {/if}
                                                <span>{member.fullName}</span>
                                            </div>
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

    <!-- ✏️ Modal แก้ไขข้อมูล & สถานะคำสั่งซื้อ (สำหรับแอดมิน) -->
    {#if isEditOrderModalOpen && editingOrder}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.65); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 99999; padding: 1rem; overflow-y: auto;"
            onclick={() => (isEditOrderModalOpen = false)}
        >
            <div
                style="background: #ffffff; border-radius: 24px; max-width: 680px; width: 100%; padding: 1.5rem 1.75rem; text-align: left; box-shadow: 0 25px 60px rgba(0,0,0,0.3); max-height: 92vh; overflow-y: auto; box-sizing: border-box;"
                onclick={(e) => e.stopPropagation()}
            >
                <!-- Modal Header -->
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.25rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.85rem;">
                    <div>
                        <h3 style="margin: 0; font-size: 1.3rem; color: #14532d; font-weight: 800; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                            <span>✏️ แก้ไขคำสั่งซื้อ {editingOrder.order_id || editingOrder.id}</span>
                        </h3>
                        <p style="margin: 0.25rem 0 0 0; font-size: 0.82rem; color: #64748b;">
                            แก้ไขสถานะออเดอร์, วันที่ส่ง, ข้อมูลผู้สั่ง, สถานที่จัดส่ง และรายการเครื่องดื่ม
                        </p>
                    </div>
                    <button
                        type="button"
                        onclick={() => (isEditOrderModalOpen = false)}
                        style="background: #f1f5f9; border: none; border-radius: 50%; width: 34px; height: 34px; font-size: 1.1rem; color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: center;"
                        title="ปิดหน้าต่าง"
                    >
                        ✕
                    </button>
                </div>

                <div style="display: flex; flex-direction: column; gap: 1.25rem;">
                    <!-- 1. สถานะออเดอร์ (Order Status) -->
                    <div style="background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 16px; padding: 1rem;">
                        <span style="font-weight: 800; font-size: 0.92rem; color: #1e293b; display: block; margin-bottom: 0.65rem;">
                            🚦 1. สถานะคำสั่งซื้อ (Order Status)
                        </span>
                        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 0.45rem;">
                            {#each [
                                { id: 'pending', label: '🔔 รอตรวจสลิป', color: '#d97706', bg: '#fef3c7' },
                                { id: 'paid', label: '💳 รับยอดแล้ว', color: '#166534', bg: '#dcfce7' },
                                { id: 'brewing', label: '🍵 กำลังชง', color: '#15803d', bg: '#dcfce7' },
                                { id: 'ready_to_ship', label: '✨ ชงเสร็จ (รอส่ง)', color: '#0369a1', bg: '#e0f2fe' },
                                { id: 'delivering', label: '🛵 กำลังส่ง', color: '#b45309', bg: '#fef3c7' },
                                { id: 'completed', label: '✅ ส่งสำเร็จ', color: '#166534', bg: '#dcfce7' },
                                { id: 'cancelled', label: '🚫 ยกเลิก', color: '#991b1b', bg: '#fee2e2' }
                            ] as st}
                                <button
                                    type="button"
                                    onclick={() => (editOrderStatus = st.id as any)}
                                    style="padding: 0.55rem 0.65rem; border-radius: 10px; font-size: 0.82rem; font-weight: 800; cursor: pointer; transition: all 0.15s; border: 2px solid {editOrderStatus === st.id ? st.color : '#e2e8f0'}; background: {editOrderStatus === st.id ? st.bg : '#ffffff'}; color: {editOrderStatus === st.id ? st.color : '#64748b'}; text-align: center;"
                                >
                                    {st.label}
                                </button>
                            {/each}
                        </div>
                    </div>

                    <!-- 2. วันที่ส่ง & รอบส่ง (Delivery Schedule) -->
                    <div style="background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 16px; padding: 1rem;">
                        <span style="font-weight: 800; font-size: 0.92rem; color: #1e293b; display: block; margin-bottom: 0.75rem;">
                            🚚 2. วันที่จัดส่ง &amp; รอบส่ง
                        </span>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0.85rem;">
                            <div>
                                <label style="display: block; font-size: 0.78rem; font-weight: 700; color: #475569; margin-bottom: 0.35rem;">
                                    📅 วันที่จัดส่ง:
                                </label>
                                <div style="display: flex; gap: 0.35rem; align-items: center;">
                                    <input
                                        type="date"
                                        bind:value={editOrderDeliveryDate}
                                        class="form-input"
                                        style="flex: 1; padding: 0.55rem 0.75rem; font-size: 0.88rem;"
                                    />
                                    <button
                                        type="button"
                                        onclick={() => (editOrderDeliveryDate = todayDateStr)}
                                        style="padding: 0.55rem 0.65rem; font-size: 0.76rem; background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; border-radius: 8px; font-weight: 700; cursor: pointer; white-space: nowrap;"
                                    >
                                        วันนี้
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label style="display: block; font-size: 0.78rem; font-weight: 700; color: #475569; margin-bottom: 0.35rem;">
                                    ⏰ รอบจัดส่ง / เวลาส่ง:
                                </label>
                                <input
                                    type="text"
                                    bind:value={editOrderDeliveryRound}
                                    placeholder="เช่น รอบเช้า, รอบเที่ยง หรือระบุเวลา 11:30"
                                    class="form-input"
                                    style="width: 100%; padding: 0.55rem 0.75rem; font-size: 0.88rem; box-sizing: border-box;"
                                />
                                <!-- Preset Pills -->
                                <div style="display: flex; gap: 0.3rem; flex-wrap: wrap; margin-top: 0.4rem;">
                                    <button
                                        type="button"
                                        onclick={() => { editOrderDeliveryRound = 'รอบเช้า (07:00–08:00 น.)'; editOrderDeliveryRoundId = 'morning'; }}
                                        style="font-size: 0.72rem; padding: 0.15rem 0.45rem; border-radius: 6px; background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; cursor: pointer;"
                                    >
                                        🌅 รอบเช้า
                                    </button>
                                    <button
                                        type="button"
                                        onclick={() => { editOrderDeliveryRound = 'รอบเที่ยง (12:30–13:00 น.)'; editOrderDeliveryRoundId = 'noon'; }}
                                        style="font-size: 0.72rem; padding: 0.15rem 0.45rem; border-radius: 6px; background: #fef3c7; color: #b45309; border: 1px solid #fde68a; cursor: pointer;"
                                    >
                                        ☀️ รอบเที่ยง
                                    </button>
                                    <button
                                        type="button"
                                        onclick={() => { editOrderDeliveryRound = 'รอบรวม (09:00–13:00 น.)'; editOrderDeliveryRoundId = 'allday'; }}
                                        style="font-size: 0.72rem; padding: 0.15rem 0.45rem; border-radius: 6px; background: #ede9fe; color: #6d28d9; border: 1px solid #ddd6fe; cursor: pointer;"
                                    >
                                        🌿 รอบรวม
                                    </button>
                                    <button
                                        type="button"
                                        onclick={() => { editOrderDeliveryRound = 'รับหน้าร้าน / เสิร์ฟทันที'; editOrderDeliveryRoundId = 'walkin'; }}
                                        style="font-size: 0.72rem; padding: 0.15rem 0.45rem; border-radius: 6px; background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; cursor: pointer;"
                                    >
                                        🚶 รับหน้าร้าน
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 3. ข้อมูลผู้รับ & สถานที่จัดส่ง -->
                    <div style="background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 16px; padding: 1rem;">
                        <span style="font-weight: 800; font-size: 0.92rem; color: #1e293b; display: block; margin-bottom: 0.75rem;">
                            👤 3. ข้อมูลผู้รับ &amp; สถานที่จัดส่ง
                        </span>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0.85rem; margin-bottom: 0.85rem;">
                            <div>
                                <label style="display: block; font-size: 0.78rem; font-weight: 700; color: #475569; margin-bottom: 0.35rem;">
                                    ชื่อผู้สั่ง / ลูกค้า:
                                </label>
                                <input
                                    type="text"
                                    bind:value={editOrderName}
                                    class="form-input"
                                    style="width: 100%; padding: 0.55rem 0.75rem; font-size: 0.88rem; box-sizing: border-box;"
                                />
                            </div>
                            <div>
                                <label style="display: block; font-size: 0.78rem; font-weight: 700; color: #475569; margin-bottom: 0.35rem;">
                                    เบอร์โทรศัพท์:
                                </label>
                                <input
                                    type="tel"
                                    bind:value={editOrderPhone}
                                    class="form-input"
                                    style="width: 100%; padding: 0.55rem 0.75rem; font-size: 0.88rem; box-sizing: border-box;"
                                />
                            </div>
                        </div>

                        <div style="margin-bottom: 0.85rem;">
                            <label style="display: block; font-size: 0.78rem; font-weight: 700; color: #475569; margin-bottom: 0.35rem;">
                                สถานที่จัดส่ง / ตึก / แผนก / ห้อง:
                            </label>
                            <textarea
                                bind:value={editOrderAddress}
                                class="form-input"
                                rows="2"
                                style="width: 100%; padding: 0.55rem 0.75rem; font-size: 0.88rem; box-sizing: border-box;"
                                placeholder="ระบุตึก แผนก หรือห้องจัดส่ง"
                            ></textarea>
                        </div>

                        <div>
                            <label style="display: block; font-size: 0.78rem; font-weight: 700; color: #475569; margin-bottom: 0.35rem;">
                                ข้อความถึงร้าน / หมายเหตุ:
                            </label>
                            <input
                                type="text"
                                bind:value={editOrderMessage}
                                class="form-input"
                                style="width: 100%; padding: 0.55rem 0.75rem; font-size: 0.88rem; box-sizing: border-box;"
                                placeholder="เช่น แยกน้ำแข็ง, โทรหาก่อนส่ง"
                            />
                        </div>
                    </div>

                    <!-- 4. รายการเครื่องดื่มที่สั่ง & ยอดเงินรวม -->
                    <div style="background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 16px; padding: 1rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
                            <span style="font-weight: 800; font-size: 0.92rem; color: #1e293b;">
                                🍵 4. รายการเครื่องดื่มในออเดอร์ ({editOrderBasket.length} แก้ว)
                            </span>
                            <button
                                type="button"
                                onclick={recalculateEditOrderTotal}
                                style="font-size: 0.75rem; font-weight: 700; background: #f0fdf4; color: #166534; border: 1px solid #86efac; border-radius: 6px; padding: 0.2rem 0.55rem; cursor: pointer;"
                            >
                                🔄 คำนวณยอดเงินตามแก้ว
                            </button>
                        </div>

                        <!-- รายการแก้วแต่ละใบ -->
                        <div style="display: flex; flex-direction: column; gap: 0.65rem; margin-bottom: 0.85rem;">
                            {#each editOrderBasket as item, idx}
                                <div style="background: #ffffff; border: 1.5px solid #cbd5e1; border-radius: 12px; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.45rem;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                                        <div style="display: flex; align-items: center; gap: 0.4rem; min-width: 0;">
                                            <span style="background: #1e293b; color: #fff; font-size: 0.72rem; font-weight: 800; padding: 0.1rem 0.45rem; border-radius: 4px;">
                                                #{idx + 1}
                                            </span>
                                            <input
                                                type="text"
                                                bind:value={item.thaiName}
                                                placeholder="ชื่อเครื่องดื่ม"
                                                class="form-input"
                                                style="padding: 0.35rem 0.5rem; font-size: 0.88rem; font-weight: 700; color: #166534; max-width: 220px;"
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onclick={() => removeDrinkFromEditOrder(idx)}
                                            style="background: #fee2e2; color: #dc2626; border: none; border-radius: 6px; padding: 0.3rem 0.6rem; font-size: 0.75rem; font-weight: 700; cursor: pointer;"
                                            title="ลบแก้วนี้"
                                        >
                                            🗑️ ลบ
                                        </button>
                                    </div>

                                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;">
                                        <!-- ความหวาน -->
                                        <div style="display: flex; align-items: center; gap: 0.3rem;">
                                            <span style="font-size: 0.75rem; color: #64748b; font-weight: 600;">หวาน:</span>
                                            <select
                                                bind:value={item.sweetness}
                                                class="form-select"
                                                style="padding: 0.25rem 0.5rem; font-size: 0.78rem; border-radius: 6px;"
                                            >
                                                <option value={0}>0% ไม่หวาน</option>
                                                <option value={25}>25% หวานน้อยมาก</option>
                                                <option value={50}>50% หวานน้อย</option>
                                                <option value={75}>75% หวานปานกลาง</option>
                                                <option value={100}>100% หวานปกติ</option>
                                            </select>
                                        </div>

                                        <!-- ท็อปปิ้ง / Addon -->
                                        <div style="display: flex; align-items: center; gap: 0.3rem;">
                                            <span style="font-size: 0.75rem; color: #64748b; font-weight: 600;">ท็อปปิ้ง:</span>
                                            <input
                                                type="text"
                                                bind:value={item.addonName}
                                                placeholder="เช่น เพิ่มช็อต (+10฿)"
                                                class="form-input"
                                                style="padding: 0.25rem 0.5rem; font-size: 0.78rem; max-width: 130px;"
                                            />
                                        </div>

                                        <!-- ราคาต่อแก้ว -->
                                        <div style="display: flex; align-items: center; gap: 0.3rem;">
                                            <span style="font-size: 0.75rem; color: #64748b; font-weight: 600;">ราคา:</span>
                                            <input
                                                type="number"
                                                bind:value={item.price}
                                                oninput={recalculateEditOrderTotal}
                                                class="form-input"
                                                style="width: 65px; padding: 0.25rem 0.4rem; font-size: 0.78rem; font-weight: 700; text-align: right;"
                                            />
                                            <span style="font-size: 0.75rem; color: #64748b;">฿</span>
                                        </div>

                                        <!-- จำนวน -->
                                        <div style="display: flex; align-items: center; gap: 0.25rem; margin-left: auto;">
                                            <button
                                                type="button"
                                                onclick={() => { if (item.quantity > 1) { item.quantity--; recalculateEditOrderTotal(); } }}
                                                style="width: 24px; height: 24px; border: 1px solid #cbd5e1; border-radius: 4px; background: #f8fafc; font-weight: 800; cursor: pointer;"
                                            >-</button>
                                            <span style="font-size: 0.85rem; font-weight: 800; min-width: 20px; text-align: center;">{item.quantity}</span>
                                            <button
                                                type="button"
                                                onclick={() => { item.quantity++; recalculateEditOrderTotal(); }}
                                                style="width: 24px; height: 24px; border: 1px solid #cbd5e1; border-radius: 4px; background: #f8fafc; font-weight: 800; cursor: pointer;"
                                            >+</button>
                                        </div>
                                    </div>

                                    <!-- โน้ตเฉพาะแก้ว -->
                                    <input
                                        type="text"
                                        bind:value={item.note}
                                        placeholder="โน้ตเพิ่มเติมสำหรับแก้วนี้..."
                                        class="form-input"
                                        style="width: 100%; padding: 0.3rem 0.5rem; font-size: 0.75rem; box-sizing: border-box;"
                                    />
                                </div>
                            {/each}
                        </div>

                        <!-- เพิ่มแก้วใหม่จากเมนู -->
                        <div style="display: flex; gap: 0.45rem; align-items: center; padding-top: 0.65rem; border-top: 1px dashed #cbd5e1;">
                            <select
                                bind:value={editOrderAddDrinkMenuId}
                                class="form-select"
                                style="flex: 1; padding: 0.45rem 0.65rem; font-size: 0.82rem;"
                            >
                                {#each menuItems as m}
                                    <option value={m.id}>{m.thaiName} ({m.price}฿)</option>
                                {/each}
                            </select>
                            <button
                                type="button"
                                onclick={addDrinkToEditOrder}
                                style="padding: 0.45rem 0.95rem; background: #166534; color: #ffffff; border: none; border-radius: 8px; font-size: 0.82rem; font-weight: 800; cursor: pointer; white-space: nowrap;"
                            >
                                ➕ เพิ่มแก้ว
                            </button>
                        </div>

                        <!-- ยอดเงินรวมทั้งสิ้น -->
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem; padding: 0.75rem; background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 12px;">
                            <span style="font-weight: 800; font-size: 0.95rem; color: #14532d;">
                                💰 ยอดเงินรวมทั้งสิ้น:
                            </span>
                            <div style="display: flex; align-items: center; gap: 0.35rem;">
                                <input
                                    type="number"
                                    bind:value={editOrderTotalPrice}
                                    class="form-input"
                                    style="width: 100px; padding: 0.35rem 0.5rem; font-size: 1.15rem; font-weight: 800; color: #14532d; text-align: right;"
                                />
                                <span style="font-weight: 800; color: #14532d; font-size: 0.95rem;">บาท</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Modal Actions -->
                <div style="display: flex; gap: 0.75rem; margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #e2e8f0;">
                    <button
                        type="button"
                        onclick={saveOrderEdit}
                        disabled={isSavingOrderEdit || editOrderBasket.length === 0}
                        style="flex: 2; padding: 0.85rem; background: #166534; color: #ffffff; border: none; border-radius: 12px; font-weight: 800; font-size: 1rem; cursor: {isSavingOrderEdit || editOrderBasket.length === 0 ? 'not-allowed' : 'pointer'}; opacity: {isSavingOrderEdit || editOrderBasket.length === 0 ? '0.6' : '1'}; display: flex; align-items: center; justify-content: center; gap: 0.4rem; box-shadow: 0 4px 14px rgba(22, 101, 52, 0.3);"
                    >
                        {isSavingOrderEdit ? '⏳ กำลังบันทึก...' : '💾 บันทึกการแก้ไขคำสั่งซื้อ'}
                    </button>
                    <button
                        type="button"
                        onclick={() => (isEditOrderModalOpen = false)}
                        class="btn-matcha-outline"
                        style="flex: 1; padding: 0.85rem; border-radius: 12px; font-weight: 700;"
                    >
                        ✕ ยกเลิก
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <!-- ============================================== -->
    <!-- 🔍 Modal ตรวจสอบคำขออนุมัติสลิป (Slip Review Modal) -->
    <!-- ============================================== -->
    {#if isSlipReviewModalOpen && reviewCurrentOrder}
        {@const reviewOrder = reviewCurrentOrder}
        {@const currentIdx = manualReviewOrders.findIndex(
            (o) => o.id === reviewOrder.id || o.order_id === reviewOrder.order_id
        )}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(5px); display: flex; align-items: center; justify-content: center; z-index: 999999; padding: 1rem; overflow-y: auto;"
            onclick={closeSlipReviewModal}
        >
            <div
                style="background: #ffffff; border-radius: 24px; max-width: 720px; width: 100%; padding: 1.5rem 1.75rem; text-align: left; box-shadow: 0 25px 60px rgba(0,0,0,0.35); max-height: 92vh; overflow-y: auto; box-sizing: border-box; display: flex; flex-direction: column; gap: 1.25rem;"
                onclick={(e) => e.stopPropagation()}
            >
                <!-- Modal Top Header -->
                <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1.5px solid #e2e8f0; padding-bottom: 0.85rem; gap: 0.75rem;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                            <span style="font-size: 1.3rem; font-weight: 800; color: #92400e; display: inline-flex; align-items: center; gap: 0.4rem;">
                                🔍 ตรวจสอบคำขออนุมัติสลิป
                            </span>
                            <span style="background: #fef3c7; color: #b45309; border: 1px solid #fde68a; font-size: 0.8rem; font-weight: 800; padding: 0.15rem 0.6rem; border-radius: 999px;">
                                #{reviewOrder.order_id || reviewOrder.id}
                            </span>
                        </div>
                        <p style="margin: 0.25rem 0 0 0; font-size: 0.82rem; color: #64748b;">
                            ลูกค้า: <strong>{reviewOrder.name}</strong>{#if reviewOrder.memberName && reviewOrder.memberName.trim() !== reviewOrder.name.trim()} <span style="color: #166534; font-weight: 700;">({reviewOrder.memberName})</span>{/if} · โทร: <a href="tel:{reviewOrder.phone}" style="color: #166534; font-weight: 700;">{reviewOrder.phone}</a>
                        </p>
                    </div>

                    <div style="display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0;">
                        {#if manualReviewOrders.length > 1}
                            <div style="display: flex; align-items: center; gap: 0.25rem; background: #f1f5f9; padding: 0.2rem 0.5rem; border-radius: 999px; font-size: 0.78rem; font-weight: 700; color: #475569;">
                                <button
                                    type="button"
                                    onclick={() => navigateSlipReview('prev')}
                                    style="border: none; background: transparent; cursor: pointer; padding: 0 0.25rem; font-size: 0.85rem; font-weight: 800; color: #1e293b;"
                                    title="คำขอก่อนหน้า"
                                >
                                    ◀
                                </button>
                                <span>{currentIdx >= 0 ? currentIdx + 1 : 1}/{manualReviewOrders.length}</span>
                                <button
                                    type="button"
                                    onclick={() => navigateSlipReview('next')}
                                    style="border: none; background: transparent; cursor: pointer; padding: 0 0.25rem; font-size: 0.85rem; font-weight: 800; color: #1e293b;"
                                    title="คำขอถัดไป"
                                >
                                    ▶
                                </button>
                            </div>
                        {/if}
                        <button
                            type="button"
                            onclick={closeSlipReviewModal}
                            style="background: #f1f5f9; border: none; border-radius: 50%; width: 34px; height: 34px; font-size: 1.1rem; color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: center;"
                            title="ปิดหน้าต่าง"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                <!-- เหตุผลที่ลูกค้าขอให้อนุมัติ (Reason Alert Banner) -->
                <div style="background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border: 1.5px solid #f59e0b; border-radius: 14px; padding: 0.85rem 1.15rem; display: flex; align-items: flex-start; gap: 0.65rem;">
                    <span style="font-size: 1.3rem; line-height: 1;">🔔</span>
                    <div style="flex: 1;">
                        <span style="font-weight: 800; font-size: 0.85rem; color: #92400e; display: block;">
                            เหตุผลที่ลูกค้าขอให้แอดมินช่วยตรวจสอบ:
                        </span>
                        <p style="margin: 0.15rem 0 0 0; font-size: 0.82rem; color: #b45309; line-height: 1.45;">
                            {reviewOrder.reviewReason || 'ลูกค้าแจ้งโอนเงินแล้วแต่ยืนยันสลิปไม่ผ่าน (ขอให้แอดมินช่วยตรวจยอดและอนุมัติ)'}
                        </p>
                    </div>
                </div>

                <!-- กล่อง 2 คอลัมน์: ซ้าย = รูปภาพสลิป, ขวา = รายละเอียดเพื่อเทียบยอด -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.25rem; align-items: start;">
                    <!-- ฝั่งซ้าย: รูปภาพสลิป -->
                    <div style="display: flex; flex-direction: column; gap: 0.65rem; background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 16px; padding: 1rem; text-align: center;">
                        <span style="font-size: 0.82rem; font-weight: 800; color: #334155; text-align: left;">
                            🧾 รูปภาพสลิปโอนเงินที่แนบมา:
                        </span>

                        {#if reviewOrder.slipImage}
                            <div style="width: 100%; border-radius: 12px; overflow: hidden; border: 1px solid #cbd5e1; background: #ffffff; max-height: 380px; display: flex; align-items: center; justify-content: center;">
                                <img
                                    src={reviewOrder.slipImage}
                                    alt="สลิปโอนเงินออเดอร์ #{reviewOrder.order_id}"
                                    style="width: 100%; max-height: 380px; object-fit: contain; display: block;"
                                />
                            </div>
                            <div style="display: flex; gap: 0.5rem; justify-content: center;">
                                <a
                                    href={reviewOrder.slipImage}
                                    target="_blank"
                                    rel="noreferrer"
                                    class="btn-matcha-outline"
                                    style="padding: 0.35rem 0.85rem; font-size: 0.78rem; text-decoration: none; display: inline-flex; align-items: center; gap: 0.3rem;"
                                >
                                    🔍 ดูรูปภาพขนาดเต็มในแท็บใหม่
                                </a>
                            </div>
                        {:else}
                            <div style="padding: 2.5rem 1rem; color: #94a3b8; font-size: 0.9rem;">
                                ⚠️ ออเดอร์นี้ไม่มีไฟล์สลิปแนบมา
                            </div>
                        {/if}
                    </div>

                    <!-- ฝั่งขวา: รายละเอียดคำสั่งซื้อ & ข้อมูลที่อ่านได้จากสลิป -->
                    <div style="display: flex; flex-direction: column; gap: 1rem;">
                        <!-- บล็อกยอดเงินที่ต้องตรงกัน -->
                        <div style="background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 16px; padding: 1rem;">
                            <span style="font-size: 0.78rem; font-weight: 700; color: #166534; text-transform: uppercase;">
                                💰 ยอดเงินในระบบที่ต้องชำระ
                            </span>
                            <div style="font-size: 1.85rem; font-weight: 900; color: #14532d; font-family: 'Outfit', sans-serif; line-height: 1.2; margin-top: 0.2rem;">
                                {reviewOrder.totalPrice} ฿
                            </div>

                            {#if reviewOrder.slipAmount || reviewOrder.slipRef || reviewOrder.slipTimeText}
                                <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px dashed #86efac; font-size: 0.8rem; color: #166534; display: flex; flex-direction: column; gap: 0.25rem;">
                                    {#if reviewOrder.slipAmount}
                                        <div><strong>ยอดที่ระบบอ่านได้:</strong> {reviewOrder.slipAmount} ฿ {#if reviewOrder.slipAmount === reviewOrder.totalPrice}<span style="color: #15803d; font-weight: 800;">(ตรงกัน ✓)</span>{:else}<span style="color: #b91c1c; font-weight: 800;">(ไม่ตรงกับยอดที่สั่ง ⚠️)</span>{/if}</div>
                                    {/if}
                                    {#if reviewOrder.slipRef}
                                        <div><strong>เลขอ้างอิงสลิป:</strong> <code>{reviewOrder.slipRef}</code></div>
                                    {/if}
                                    {#if reviewOrder.slipTimeText}
                                        <div><strong>เวลาโอนในสลิป:</strong> {reviewOrder.slipTimeText}</div>
                                    {/if}
                                </div>
                            {/if}
                        </div>

                        <!-- ข้อมูลจัดส่ง & วันรอบ -->
                        <div style="background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 16px; padding: 1rem; font-size: 0.82rem; display: flex; flex-direction: column; gap: 0.45rem;">
                            <div>
                                <span style="color: #64748b;">📅 วันที่ส่ง:</span> 
                                <strong style="color: #1e293b;">{formatThaiDateDisplay(reviewOrder.deliveryDate || reviewOrder.createdAt.slice(0, 10))}</strong>
                                <span style="margin-left: 0.5rem; color: #64748b;">⏰ รอบส่ง:</span>
                                <strong style="color: #1e293b;">{reviewOrder.deliveryRound || 'รอบปกติ'}</strong>
                            </div>
                            <div>
                                <span style="color: #64748b;">📍 สถานที่ส่ง:</span> 
                                <strong style="color: #1e293b;">{reviewOrder.address}</strong>
                            </div>
                            {#if reviewOrder.message}
                                <div>
                                    <span style="color: #64748b;">💬 โน้ตลูกค้า:</span> 
                                    <span style="color: #0f172a; font-style: italic;">"{reviewOrder.message}"</span>
                                </div>
                            {/if}
                        </div>

                        <!-- รายการสินค้าในตะกร้า -->
                        <div style="background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 16px; padding: 0.85rem 1rem;">
                            <span style="font-size: 0.78rem; font-weight: 800; color: #475569; display: block; margin-bottom: 0.4rem;">
                                🍵 รายการเครื่องดื่ม ({reviewOrder.basket?.length || 0} รายการ):
                            </span>
                            <div style="max-height: 140px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.35rem;">
                                {#each reviewOrder.basket || [] as item}
                                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; border-bottom: 1px dashed #e2e8f0; padding-bottom: 0.25rem;">
                                        <div>
                                            <span style="font-weight: 700; color: #1e293b;">{item.name || item.thaiName}</span>
                                            <span style="color: #64748b; font-size: 0.74rem;">
                                                (หวาน {item.sweetness ?? 50}%{#if item.addonName}, +{item.addonName}{/if})
                                            </span>
                                        </div>
                                        <div style="font-weight: 700; color: #166534; white-space: nowrap;">
                                            x{item.quantity || 1} ({item.price * (item.quantity || 1)}฿)
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Footer Action Buttons -->
                <div style="display: flex; gap: 0.65rem; border-top: 1.5px solid #e2e8f0; padding-top: 1.15rem; flex-wrap: wrap;">
                    <button
                        type="button"
                        onclick={handleApproveSlipFromModal}
                        disabled={isProcessingSlipReview}
                        class="btn-matcha-primary"
                        style="flex: 2; min-width: 180px; padding: 0.85rem; font-size: 0.98rem; font-weight: 800; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; gap: 0.45rem; background: #166534; box-shadow: 0 4px 14px rgba(22, 101, 52, 0.3);"
                    >
                        {#if isProcessingSlipReview}
                            ⏳ กำลังอนุมัติ...
                        {:else}
                            ✓ อนุมัติสลิป & รับยอดเข้าคิวชง
                        {/if}
                    </button>

                    <button
                        type="button"
                        onclick={handleRejectSlipFromModal}
                        disabled={isProcessingSlipReview}
                        class="btn-danger"
                        style="flex: 1; min-width: 130px; padding: 0.85rem; font-size: 0.92rem; font-weight: 700; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem;"
                    >
                        ✕ ปฏิเสธสลิป
                    </button>

                    <button
                        type="button"
                        onclick={() => {
                            const ord = reviewOrder;
                            closeSlipReviewModal();
                            openEditOrderModal(ord);
                        }}
                        style="padding: 0.85rem 1rem; border-radius: 12px; font-weight: 700; font-size: 0.88rem; background: #f8fafc; border: 1.5px solid #cbd5e1; color: #334155; cursor: pointer; display: inline-flex; align-items: center; gap: 0.3rem;"
                        title="เปิดแก้ไขรายละเอียดออเดอร์"
                    >
                        ✏️ แก้ไขออเดอร์
                    </button>

                    <button
                        type="button"
                        onclick={closeSlipReviewModal}
                        class="btn-matcha-outline"
                        style="padding: 0.85rem 1rem; border-radius: 12px; font-weight: 700; font-size: 0.88rem;"
                    >
                        ปิด
                    </button>
                </div>
            </div>
        </div>
    {/if}


</main>
{/if}

<style>
    .admin-page-shell {
        max-width: 1100px !important;
        width: 100% !important;
        margin: 0 auto !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: stretch !important;
        box-sizing: border-box !important;
    }

    .admin-page-shell .form-card {
        max-width: 100% !important;
        width: 100% !important;
        margin: 0 !important;
        box-sizing: border-box !important;
    }

    .admin-order-card {
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
    }

    .brew-summary-card {
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
    }

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
        grid-template-columns: repeat(5, 1fr);
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

    /* 📅 Admin Calendar Component Styles */
    .admin-calendar-card {
        padding: 1.5rem;
        background: #ffffff;
        border-radius: 18px;
        border: 1.5px solid var(--border-matcha);
        text-align: left;
    }

    .admin-calendar-header-box {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.75rem;
        margin-bottom: 1.15rem;
    }

    .admin-calendar-title {
        margin: 0;
        font-size: 1.25rem;
        color: var(--matcha-deep);
    }

    .admin-calendar-desc {
        margin: 0.2rem 0 0 0;
        font-size: 0.825rem;
        color: var(--text-muted);
    }

    .admin-calendar-month-btns {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .cal-nav-btn {
        padding: 0.45rem 0.85rem;
        font-size: 0.85rem;
        border-radius: 10px;
    }

    .admin-calendar-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem 0.65rem;
        margin-bottom: 0.85rem;
        font-size: 0.78rem;
        font-weight: 600;
        padding: 0.55rem 0.75rem;
        background: #f8fafc;
        border-radius: 12px;
        border: 1px solid #e2e8f0;
        align-items: center;
    }

    .legend-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.12rem 0.45rem;
        border-radius: 6px;
        background: #ffffff;
        border: 1px solid #e2e8f0;
    }

    .legend-chip.both { color: #166534; border-color: #bbf7d0; background: #f0fdf4; }
    .legend-chip.morning { color: #1d4ed8; border-color: #bfdbfe; background: #eff6ff; }
    .legend-chip.noon { color: #b45309; border-color: #fde68a; background: #fffbeb; }
    .legend-chip.allday { color: #5b21b6; border-color: #ddd6fe; background: #f5f3ff; }
    .legend-chip.closed { color: #64748b; }

    .legend-dot {
        width: 8px;
        height: 8px;
        border-radius: 2px;
        display: inline-block;
    }

    .legend-tip {
        margin-left: auto;
        color: #94a3b8;
        font-size: 0.72rem;
    }

    .admin-calendar-week-headers {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 0.35rem;
        text-align: center;
        font-weight: 800;
        font-size: 0.85rem;
        margin-bottom: 0.35rem;
    }

    .admin-calendar-grid {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 0.35rem;
        width: 100%;
        box-sizing: border-box;
    }

    .admin-calendar-cell {
        min-height: 74px;
        min-width: 0;
        overflow: hidden;
        border-radius: 12px;
        padding: 0.35rem 0.25rem;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        cursor: pointer;
        border: 2px solid #e2e8f0;
        background: #ffffff;
        transition: all 0.15s ease;
        box-sizing: border-box;
    }

    .admin-calendar-cell.is-both {
        border-color: #22c55e;
        background: #f0fdf4;
    }
    .admin-calendar-cell.is-morning {
        border-color: #3b82f6;
        background: #eff6ff;
    }
    .admin-calendar-cell.is-noon {
        border-color: #f59e0b;
        background: #fffbeb;
    }
    .admin-calendar-cell.is-allday {
        border-color: #8b5cf6;
        background: #f5f3ff;
    }
    .admin-calendar-cell.not-current-month {
        opacity: 0.4;
    }

    .admin-cal-cell-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        line-height: 1;
    }

    .admin-cal-day-num {
        font-family: 'Outfit', sans-serif;
        font-weight: 800;
        font-size: 0.95rem;
        color: #475569;
    }

    .admin-calendar-cell.is-both .admin-cal-day-num { color: #166534; }
    .admin-calendar-cell.is-morning .admin-cal-day-num { color: #1d4ed8; }
    .admin-calendar-cell.is-noon .admin-cal-day-num { color: #b45309; }
    .admin-calendar-cell.is-allday .admin-cal-day-num { color: #5b21b6; }

    .admin-cal-gear-btn {
        background: #ffffff;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        font-size: 0.65rem;
        cursor: pointer;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        line-height: 1;
        box-shadow: 0 1px 2px rgba(0,0,0,0.06);
    }

    .admin-cal-cell-badge {
        text-align: center;
        margin-top: 0.15rem;
    }

    .cal-badge {
        display: block;
        font-size: 0.62rem;
        font-weight: 800;
        border-radius: 4px;
        padding: 1px 2px;
        line-height: 1.25;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .cal-badge.both { background: #dcfce7; color: #166534; }
    .cal-badge.morning { background: #dbeafe; color: #1d4ed8; }
    .cal-badge.noon { background: #fef3c7; color: #b45309; }
    .cal-badge.allday { background: #ede9fe; color: #5b21b6; }
    .cal-badge.closed { background: transparent; color: #94a3b8; font-weight: 500; font-size: 0.62rem; }

    @media (max-width: 768px) {
        .admin-page-shell {
            padding-top: 0.85rem !important;
            padding-left: 0.5rem !important;
            padding-right: 0.5rem !important;
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
            overflow-x: hidden !important;
        }

        .admin-order-card {
            padding: 1rem 0.85rem !important;
        }

        .admin-header-bar {
            flex-direction: column;
            align-items: stretch;
            gap: 0.65rem;
            background: #ffffff;
            border: 1.5px solid #d8e8d2;
            border-radius: 16px;
            padding: 0.85rem 0.75rem !important;
            margin-bottom: 0.75rem !important;
        }

        .admin-page-title {
            font-size: 1.15rem !important;
            line-height: 1.3 !important;
        }

        .admin-header-actions {
            width: 100%;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.4rem;
        }

        .admin-header-actions button,
        .admin-header-actions a {
            width: 100%;
            justify-content: center;
        }

        /* 📱 Main Tabs: Horizontal Scrollable Pill Bar */
        .admin-main-tabs {
            display: flex !important;
            grid-template-columns: none !important;
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch !important;
            scrollbar-width: none !important;
            padding: 0.35rem 0.45rem !important;
            gap: 0.4rem !important;
            border-radius: 999px !important;
            margin-bottom: 1rem !important;
            background: #eef6ec !important;
            border: 1px solid #d1e5cb !important;
        }

        .admin-main-tabs::-webkit-scrollbar {
            display: none !important;
        }

        .admin-main-tab-btn {
            flex-shrink: 0 !important;
            font-size: 0.82rem !important;
            padding: 0.5rem 0.85rem !important;
            white-space: nowrap !important;
            border-radius: 999px !important;
        }

        /* 📅 Calendar Mobile Responsiveness: 7 วันพอดีจอ ไม่ล้น ไม่โดนตัด */
        .admin-calendar-card {
            padding: 0.75rem 0.4rem !important;
            border-radius: 14px !important;
        }

        .admin-calendar-header-box {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 0.6rem !important;
            margin-bottom: 0.75rem !important;
        }

        .admin-calendar-title {
            font-size: 1.05rem !important;
        }

        .admin-calendar-desc {
            font-size: 0.75rem !important;
        }

        .admin-calendar-month-btns {
            width: 100% !important;
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 0.4rem !important;
        }

        .cal-nav-btn {
            width: 100% !important;
            text-align: center !important;
            padding: 0.45rem 0.5rem !important;
            font-size: 0.82rem !important;
        }

        .admin-calendar-legend {
            font-size: 0.7rem !important;
            padding: 0.45rem 0.5rem !important;
            gap: 0.25rem 0.35rem !important;
            margin-bottom: 0.65rem !important;
        }

        .legend-chip {
            padding: 0.1rem 0.35rem !important;
            font-size: 0.68rem !important;
        }

        .legend-tip {
            width: 100% !important;
            margin-top: 0.2rem !important;
            font-size: 0.68rem !important;
        }

        .admin-calendar-week-headers {
            grid-template-columns: repeat(7, minmax(0, 1fr)) !important;
            gap: 0.12rem !important;
            font-size: 0.75rem !important;
            margin-bottom: 0.25rem !important;
        }

        .admin-calendar-grid {
            grid-template-columns: repeat(7, minmax(0, 1fr)) !important;
            gap: 0.15rem !important;
        }

        .admin-calendar-cell {
            min-height: 56px !important;
            min-width: 0 !important;
            width: 100% !important;
            overflow: hidden !important;
            padding: 0.2rem 0.1rem !important;
            border-radius: 8px !important;
            border-width: 1.5px !important;
        }

        .admin-cal-day-num {
            font-size: 0.74rem !important;
        }

        .admin-cal-gear-btn {
            width: 15px !important;
            height: 15px !important;
            font-size: 0.52rem !important;
            border-radius: 4px !important;
            padding: 0 !important;
        }

        .cal-badge {
            font-size: 0.52rem !important;
            padding: 0.5px 1px !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            max-width: 100% !important;
            display: block !important;
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

        /* LINE OA SubTabs & Mobile Adjustments */
        .line-subtabs-bar {
            padding-left: 0.1rem;
            padding-right: 0.1rem;
        }

        .line-subtab-btn {
            font-size: 0.8rem;
            padding: 0.45rem 0.8rem;
        }

        .line-notify-grid {
            grid-template-columns: 1fr !important;
            gap: 0.6rem !important;
        }

        .designer-mobile-switch {
            display: flex;
        }

        .designer-workspace-grid {
            grid-template-columns: 1fr !important;
        }

        .designer-col-blocks {
            display: none !important;
        }

        .designer-col-blocks.mobile-active {
            display: flex !important;
        }

        .designer-col-preview {
            display: none !important;
            position: static !important;
        }

        .designer-col-preview.mobile-active {
            display: flex !important;
        }

        .line-keywords-desktop-table {
            display: none !important;
        }

        .line-keywords-mobile-list {
            display: flex !important;
        }

        .line-users-desktop-table {
            display: none !important;
        }

        .line-users-mobile-list {
            display: flex !important;
        }
    }

    /* ========================================================
       💬 LINE OA SUBTABS & MOBILE RESPONSIVENESS
       ======================================================== */
    .line-subtabs-bar {
        display: flex;
        gap: 0.5rem;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        padding: 0.25rem 0.15rem 0.5rem;
        margin-bottom: 0.25rem;
    }

    .line-subtabs-bar::-webkit-scrollbar {
        display: none;
    }

    .line-subtab-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.55rem 0.95rem;
        border-radius: 999px;
        border: 1.5px solid #cbd5e1;
        background: #ffffff;
        color: #475569;
        font-size: 0.88rem;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
        transition: all 0.18s ease;
        box-shadow: 0 1px 3px rgba(0,0,0,0.03);
        flex-shrink: 0;
    }

    .line-subtab-btn:hover {
        border-color: #06c755;
        color: #166534;
        background: #f0fdf4;
    }

    .line-subtab-btn.active {
        background: #06c755;
        color: #ffffff;
        border-color: #06c755;
        box-shadow: 0 4px 12px rgba(6, 199, 85, 0.25);
    }

    .line-notify-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 0.85rem;
    }

    .designer-mobile-switch {
        display: none;
        gap: 0.4rem;
        background: #f1f5f9;
        padding: 0.3rem;
        border-radius: 12px;
        margin-bottom: 1rem;
    }

    .designer-switch-btn {
        flex: 1;
        padding: 0.6rem 0.5rem;
        border-radius: 9px;
        border: none;
        background: transparent;
        color: #64748b;
        font-weight: 700;
        font-size: 0.85rem;
        cursor: pointer;
        transition: all 0.15s ease;
    }

    .designer-switch-btn.active {
        background: #ffffff;
        color: #166534;
        box-shadow: 0 2px 6px rgba(0,0,0,0.08);
    }

    .designer-workspace-grid {
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    }

    .designer-col-blocks,
    .designer-col-preview {
        display: flex;
    }

    .line-keywords-desktop-table {
        display: block;
    }

    .line-keywords-mobile-list {
        display: none;
        flex-direction: column;
        gap: 0.75rem;
    }

    .line-keyword-card {
        border: 1.5px solid #e2e8f0;
        border-radius: 12px;
        padding: 0.85rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        box-shadow: 0 1px 3px rgba(0,0,0,0.02);
    }

    .line-users-desktop-table {
        display: block;
    }

    .line-users-mobile-list {
        display: none;
        flex-direction: column;
        gap: 0.75rem;
    }

    .line-user-card {
        background: #ffffff;
        border: 1.5px solid #e2e8f0;
        border-radius: 12px;
        padding: 0.85rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        box-shadow: 0 1px 4px rgba(0,0,0,0.03);
    }
</style>

