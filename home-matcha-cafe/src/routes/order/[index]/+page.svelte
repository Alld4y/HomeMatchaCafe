<script lang="ts">
    import { page } from '$app/state';
    import { goto } from '$app/navigation';
    import { getContext, onMount } from 'svelte';
    import swal from 'sweetalert2';

    const cart = getContext<any>('cartData');

    interface AddonOption {
        id: string;
        name: string;
        price: number;
    }

    interface DrinkRecord {
        thaiName: string;
        englishName: string;
        price: number;
        desc: string;
        notes: string;
        imageUrl?: string;
        addons?: AddonOption[];
    }

    let menuDatabase = $state<Record<string, DrinkRecord>>({
        'pure-matcha': {
            thaiName: 'เพียวมัทฉะ',
            englishName: 'PURE MATCHA',
            price: 50,
            desc: 'มัทฉะเกรดพิธีการแท้ตีด้วยน้ำแร่ หอมเข้ม สดชื่น ไร้นม ดื่มง่ายดีต่อสุขภาพ',
            notes: 'แนะนำหวาน 0% หรือ 25% เพื่อสัมผัสรสชาติมัทฉะแท้',
            addons: []
        },
        'matcha-latte': {
            thaiName: 'มัทฉะลาเต้',
            englishName: 'MATCHA LATTE',
            price: 55,
            desc: 'มัทฉะเข้มข้นผสานนมสดแท้รสละมุน หอมมันกลมกล่อมลงตัว รสสัมผัสยอดนิยม',
            notes: 'ระดับความหวาน 50% เป็นสูตรมาตรฐานที่ลงตัวที่สุด',
            addons: []
        },
        'matcha-coconut': {
            thaiName: 'มัทฉะมะพร้าว',
            englishName: 'MATCHA COCONUT',
            price: 60,
            desc: 'มัทฉะแท้เลเยอร์บนน้ำมะพร้าวน้ำหอมแท้ 100% หวานธรรมชาติ ดื่มแล้วสดชื่นสุดใจ',
            notes: 'น้ำมะพร้าวมีความหวานธรรมชาติอยู่แล้ว แนะนำหวาน 0% - 25%',
            addons: []
        },
        'matcha-oat-latte': {
            thaiName: 'มัทฉะลาเต้นมโอ๊ต',
            englishName: 'MATCHA OAT LATTE',
            price: 65,
            desc: 'มัทฉะจับคู่กับนมโอ๊ตสูตรบาริสต้าพรีเมียม หอมนวล รสสัมผัสครีมมี่ Plant-Based 100%',
            notes: 'เหมาะสำหรับผู้แพ้นมวัว หรือชื่นชอบความหอมมันของนมโอ๊ต',
            addons: []
        },
        'cold-fermented-matcha-oat-latte': {
            thaiName: 'มัทฉะลาเต้นมโอ๊ตบ่ม',
            englishName: 'COLD FERMENTED MATCHA OAT LATTE',
            price: 70,
            desc: 'กรรมวิธีบ่มสกัดเย็นพิเศษ เพิ่มมิติรสชาติ Umami นุ่มละมุนลึกซึ้ง เอกลักษณ์เฉพาะร้าน',
            notes: 'เมนู Signature พิเศษ รสชาติลุ่มลึก ละมุนลิ้น',
            addons: []
        }
    });

    let drinkId = $derived(page.params.index || 'matcha-latte');
    let drinkInfo = $derived(menuDatabase[drinkId] || {
        thaiName: drinkId,
        englishName: drinkId.toUpperCase(),
        price: 55,
        desc: 'เครื่องดื่มมัทฉะคุณภาพพรีเมียม',
        notes: 'ชงสดใหม่แก้วต่อแก้ว',
        addons: []
    });

    let selectedSweet = $state(50);
    let selectedAddonId = $state<string>('');
    let quantity = $state(1);
    let customNote = $state('');

    let selectedAddon = $derived(
        (drinkInfo.addons || []).find((a) => a.id === selectedAddonId) || null
    );
    let unitPrice = $derived(
        Number(drinkInfo.price) + (selectedAddon ? Number(selectedAddon.price || 0) : 0)
    );
    let totalOrderPrice = $derived(unitPrice * quantity);

    const sweetnessLevels = [
        { value: 0, name: 'ไม่หวาน', desc: '0% น้ำตาล', icon: '🌿' },
        { value: 25, name: 'หวานน้อย', desc: '25% สุขภาพ', icon: '🌱' },
        { value: 50, name: 'หวานปกติ', desc: '50% สูตรทางร้าน', icon: '🍵' },
        { value: 75, name: 'หวานมาก', desc: '75% กลมกล่อม', icon: '🍯' },
        { value: 100, name: 'หวานเต็มที่', desc: '100% หวานฉ่ำ', icon: '✨' }
    ];

    onMount(async () => {
        try {
            const res = await fetch('/api/menus');
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data.items)) {
                    const updatedMap: Record<string, DrinkRecord> = { ...menuDatabase };
                    for (const item of data.items) {
                        updatedMap[item.id] = {
                            thaiName: item.thaiName,
                            englishName: item.englishName,
                            price: Number(item.price) || 55,
                            desc: item.description || '',
                            notes: item.notes || 'ชงสดใหม่แก้วต่อแก้ว',
                            imageUrl: item.imageUrl || '',
                            addons: Array.isArray(item.addons) ? item.addons : []
                        };
                    }
                    menuDatabase = updatedMap;
                }
            }
        } catch (e) {
            console.error('Failed to load dynamic drink details:', e);
        }
    });

    function handleImgError(e: Event) {
        const target = e.currentTarget as HTMLImageElement;
        if (target && !target.src.endsWith('/image/pure-matcha.jpg')) {
            target.src = '/image/pure-matcha.jpg';
        }
    }

    function handleAddToCart() {
        if (quantity <= 0) return;

        const addonName = selectedAddon ? selectedAddon.name : '';
        const addonPrice = selectedAddon ? Number(selectedAddon.price || 0) : 0;

        cart.addItem({
            id: drinkId,
            thaiName: drinkInfo.thaiName,
            englishName: drinkInfo.englishName,
            name: drinkInfo.thaiName,
            price: unitPrice,
            basePrice: Number(drinkInfo.price),
            addonName,
            addonPrice,
            quantity: quantity,
            sweetness: selectedSweet,
            note: customNote.trim()
        });

        const addonText = addonName ? ` · +${addonName} (+${addonPrice}฿)` : '';
        const noteText = customNote.trim() ? ` (โน้ต: ${customNote.trim()})` : '';
        swal.fire({
            icon: 'success',
            title: 'เพิ่มลงในตะกร้าแล้ว',
            text: `${drinkInfo.thaiName} (หวาน ${selectedSweet}%${addonText}) จำนวน ${quantity} แก้ว${noteText}`,
            showCancelButton: true,
            confirmButtonColor: '#456f2f',
            cancelButtonColor: '#c49132',
            confirmButtonText: 'ไปที่ตะกร้า / ชำระเงิน',
            cancelButtonText: 'สั่งเครื่องดื่มอื่นต่อ'
        }).then((result) => {
            if (result.isConfirmed) {
                goto('/location');
            } else {
                goto('/menu');
            }
        });
    }
</script>

<svelte:head>
    <title>ปรับแต่ง {drinkInfo.thaiName} | Home Matcha Cafe</title>
</svelte:head>

<main class="menu-page-wrapper">
    <div style="width: 100%; max-width: 680px; margin-bottom: 1rem;">
        <button 
            onclick={() => goto('/menu')} 
            class="btn-matcha-outline" 
            style="padding: 0.4rem 0.9rem; font-size: 0.825rem;"
        >
            ← กลับไปหน้าเมนู
        </button>
    </div>

    <div class="order-detail-card">
        <!-- Header ส่วนข้อมูลเครื่องดื่ม -->
        <div class="order-detail-header">
            <div class="order-detail-img-box">
                <img 
                    oncontextmenu={(e) => e.preventDefault()} 
                    onerror={handleImgError}
                    class="order-detail-img protect-img" 
                    src={drinkInfo.imageUrl || `/image/${drinkId}.jpg`} 
                    alt={drinkInfo.englishName} 
                />
            </div>
            <div>
                <span class="status-pill open" style="font-size: 0.7rem; margin-bottom: 0.35rem;">ชงสดใหม่</span>
                <h1 style="margin: 0 0 0.25rem 0; font-size: 1.5rem; color: var(--matcha-deep);">{drinkInfo.thaiName}</h1>
                <p style="margin: 0 0 0.5rem 0; font-size: 0.8rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">
                    {drinkInfo.englishName}
                </p>
                <div style="font-family: 'Outfit', sans-serif; font-size: 1.5rem; font-weight: 700; color: var(--matcha-dark);">
                    {unitPrice} <span style="font-size: 0.9rem; font-weight: 500;">บาท</span>
                    {#if selectedAddon}
                        <span style="font-size: 0.78rem; color: #16a34a; font-weight: 700;">
                            (ปกติ {drinkInfo.price}฿ + {selectedAddon.name} {selectedAddon.price}฿)
                        </span>
                    {/if}
                </div>
            </div>
        </div>

        <p style="margin: 0; font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5; background: var(--matcha-tint); padding: 0.75rem 1rem; border-radius: var(--radius-md); border-left: 3px solid var(--matcha-primary);">
            💡 {drinkInfo.notes}
        </p>

        <!-- เลือกระดับความหวาน -->
        <div>
            <div class="form-label" style="margin-bottom: 0.75rem;">
                <span>เลือกระดับความหวาน (Sweetness Level)</span>
            </div>
            <div class="sweetness-options-grid">
                {#each sweetnessLevels as s}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div 
                        class="sweetness-option-card {selectedSweet === s.value ? 'selected' : ''}" 
                        onclick={() => selectedSweet = s.value}
                    >
                        <span style="font-size: 1.25rem;">{s.icon}</span>
                        <span class="sweetness-pct">{s.value}%</span>
                        <span class="sweetness-name">{s.name}</span>
                    </div>
                {/each}
            </div>
        </div>

        <!-- 🍵 เลือกเพิ่มช็อต / ตัวเลือกเสริม (แสดงเมื่อแอดมินตั้งค่าไว้ในเมนูนี้ และเลือกได้เพียง 1 ตัวเลือกต่อแก้ว) -->
        {#if drinkInfo.addons && drinkInfo.addons.length > 0}
            <div style="padding-top: 1rem; border-top: 1px dashed var(--border-light);">
                <div class="form-label" style="margin-bottom: 0.65rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.35rem;">
                    <span>🍵 เพิ่มช็อต / ตัวเลือกเสริม (Extra Shot)</span>
                    <span style="font-size: 0.75rem; font-weight: 600; color: #166534; background: #dcfce7; padding: 0.15rem 0.6rem; border-radius: 999px;">
                        เลือกได้ 1 ตัวเลือกต่อแก้ว
                    </span>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.6rem;">
                    <!-- ตัวเลือกปกติ (ไม่เพิ่มช็อต) -->
                    <button
                        type="button"
                        onclick={() => (selectedAddonId = '')}
                        style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; padding: 0.7rem 0.9rem; border-radius: 12px; border: 2px solid {selectedAddonId === '' ? 'var(--matcha-primary)' : '#e2e8f0'}; background: {selectedAddonId === '' ? '#f0fdf4' : '#ffffff'}; color: {selectedAddonId === '' ? '#14532d' : '#475569'}; font-family: inherit; font-size: 0.88rem; font-weight: {selectedAddonId === '' ? '800' : '600'}; cursor: pointer; text-align: left; transition: all 0.15s ease;"
                    >
                        <span>{selectedAddonId === '' ? '●' : '○'} สูตรปกติ (ไม่เพิ่มช็อต)</span>
                        <span style="font-size: 0.8rem; color: #64748b;">+0 ฿</span>
                    </button>

                    {#each drinkInfo.addons as addon}
                        {@const isAddonSelected = selectedAddonId === addon.id}
                        <button
                            type="button"
                            onclick={() => (selectedAddonId = isAddonSelected ? '' : addon.id)}
                            style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; padding: 0.7rem 0.9rem; border-radius: 12px; border: 2px solid {isAddonSelected ? 'var(--matcha-primary)' : '#e2e8f0'}; background: {isAddonSelected ? '#dcfce7' : '#ffffff'}; color: {isAddonSelected ? '#14532d' : '#1e293b'}; font-family: inherit; font-size: 0.88rem; font-weight: {isAddonSelected ? '800' : '700'}; cursor: pointer; text-align: left; transition: all 0.15s ease;"
                        >
                            <span>{isAddonSelected ? '●' : '○'} {addon.name}</span>
                            <span style="font-size: 0.82rem; font-weight: 800; color: #166534; background: {isAddonSelected ? '#ffffff' : '#f0fdf4'}; padding: 0.15rem 0.5rem; border-radius: 999px; border: 1px solid #86efac; white-space: nowrap;">
                                +{addon.price} ฿
                            </span>
                        </button>
                    {/each}
                </div>
            </div>
        {/if}

        <!-- เลือกจำนวนแก้ว -->
        <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 1rem; border-top: 1px dashed var(--border-light);">
            <div>
                <p style="margin: 0; font-weight: 700; color: var(--matcha-deep);">จำนวนแก้ว</p>
                <p style="margin: 0; font-size: 0.8rem; color: var(--text-muted);">ยอดรวม: {totalOrderPrice} บาท</p>
            </div>

            <div class="quantity-stepper">
                <button 
                    class="stepper-btn" 
                    disabled={quantity <= 1} 
                    onclick={() => quantity > 1 && quantity--}
                >-</button>
                <span class="stepper-value">{quantity}</span>
                <button 
                    class="stepper-btn" 
                    disabled={quantity >= 20} 
                    onclick={() => quantity < 20 && quantity++}
                >+</button>
            </div>
        </div>

        <!-- รายละเอียดเพิ่มเติม / Note -->
        <div style="padding-top: 1rem; border-top: 1px dashed var(--border-light);">
            <label for="custom-note" class="form-label" style="margin-bottom: 0.5rem; display: block;">
                <span>รายละเอียดเพิ่มเติม (ถ้ามี)</span>
            </label>
            <input 
                id="custom-note"
                type="text" 
                class="form-input" 
                placeholder="เช่น แยกน้ำแข็ง, หวานธรรมชาติ, ฯลฯ"
                bind:value={customNote}
                style="width: 100%; border: 1px solid var(--border-light); border-radius: var(--radius-md); padding: 0.65rem 0.85rem; font-family: inherit; font-size: 0.9rem;"
            />
        </div>

        <!-- ปุ่มเพิ่มลงตะกร้า -->
        <div style="display: flex; gap: 0.75rem; margin-top: 0.5rem;">
            <button 
                onclick={handleAddToCart} 
                class="btn-matcha-primary" 
                style="flex-grow: 1; padding: 0.9rem;"
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <path d="M16 10a4 4 0 0 1-8 0"></path>
                </svg>
                เพิ่มลงตะกร้า ({totalOrderPrice}.-)
            </button>
        </div>
    </div>
</main>