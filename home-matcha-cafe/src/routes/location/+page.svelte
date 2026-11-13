<script lang="ts">
    import { goto } from '$app/navigation';
    import { onMount, getContext } from 'svelte';
    import swal from 'sweetalert2';

    const cart = getContext<any>('cartData');
    const memberCtx = getContext<any>('memberData');

    let recipientName = $state('');
    let phone = $state('');
    let address = $state('');
    let sellerMessage = $state('');
    let errorMessage = $state('');
    let isSubmitting = $state(false);

    // ข้อมูลวันและรอบจัดส่ง
    let scheduleDays = $state<any[]>([]);
    let storeSettings = $state<any>(null);
    let selectedDateStr = $state<string>('');
    let selectedRoundId = $state<string>('morning');

    const hospitalPresets = [
        'ตึกผู้ป่วยใน (IPD) ชั้น 2',
        'ตึกผู้ป่วยใน (IPD) ชั้น 3',
        'แผนกผู้ป่วยนอก (OPD)',
        'ห้องฉุกเฉิน (ER)',
        'ตึกอำนวยการ / ธุรการ',
        'ห้องปฏิบัติการ / แล็บ',
        'ห้องยา / เภสัชกรรม',
        'บ้านพักแพทย์ / พยาบาล',
        'แฟลตเจ้าหน้าที่'
    ];

    // ตรวจสอบว่าในตะกร้ามีเมนูบ่มสกัดเย็นหรือไม่
    let hasFermentedItem = $derived(
        (cart.items || []).some((item: any) => 
            (storeSettings?.fermentedItemIds || ['cold-fermented-matcha-oat-latte']).includes(item.id) ||
            (item.thaiName || '').includes('บ่ม') ||
            (item.name || '').includes('บ่ม')
        )
    );

    // รายการวันที่เปิดรับออเดอร์และยังมีรอบเปิดให้สั่งได้ (ไม่เลยเวลาตัดรอบทั้งหมด)
    let orderableDates = $derived(scheduleDays.filter((d) => d.isOpen && !d.isPastAllCutoffs));
    let allDisplayDates = $derived(scheduleDays.filter((d) => d.isOpen));

    // วันที่เลือกในปัจจุบัน
    let selectedDayInfo = $derived(allDisplayDates.find((d) => d.dateStr === selectedDateStr));

    // เมื่อเปลี่ยนวันที่ ให้เลือกรอบแรกที่เปิดในวันนั้นอัตโนมัติถ้ารอบเดิมไม่อยู่ในรายการ
    $effect(() => {
        if (selectedDayInfo && Array.isArray(selectedDayInfo.availableRounds) && selectedDayInfo.availableRounds.length > 0) {
            const existsAndAvailable = selectedDayInfo.availableRounds.some(
                (r: any) => r.id === selectedRoundId && getRoundAvailability(r, selectedDateStr).available
            );
            if (!existsAndAvailable) {
                const firstAvail = selectedDayInfo.availableRounds.find(
                    (r: any) => getRoundAvailability(r, selectedDateStr).available
                ) || selectedDayInfo.availableRounds[0];
                if (firstAvail) {
                    selectedRoundId = firstAvail.id;
                }
            }
        }
    });

    // ตรวจสอบว่าวันที่เลือกยังทันเวลาสั่งเมนูบ่มหรือไม่ (ก่อน 23:00 น. ของวันก่อนส่ง)
    function isDateValidForFermented(dateStr: string): boolean {
        if (!dateStr) return false;
        const now = new Date();
        const [y, m, d] = dateStr.split('-').map(Number);
        const [cutoffH, cutoffM] = (storeSettings?.fermentedCutoffTime || '23:00').split(':').map(Number);
        const fermentedDeadline = new Date(y, m - 1, d - 1, cutoffH, cutoffM, 59, 999);
        return now.getTime() <= fermentedDeadline.getTime();
    }

    // ตรวจสอบความพร้อมของแต่ละรอบในวันที่เลือก
    function getRoundAvailability(round: any, dateStr: string) {
        if (!dateStr) return { available: false, reason: 'กรุณาเลือกวันที่ก่อน' };

        const now = new Date();
        const [y, m, d] = dateStr.split('-').map(Number);

        if (hasFermentedItem) {
            const [cutoffH, cutoffM] = (storeSettings?.fermentedCutoffTime || '23:00').split(':').map(Number);
            const fermentedDeadline = new Date(y, m - 1, d - 1, cutoffH, cutoffM, 59, 999);

            if (now.getTime() > fermentedDeadline.getTime()) {
                return { 
                    available: false, 
                    reason: `เลยเวลาปิดรับเมนูบ่ม (${storeSettings?.fermentedCutoffTime || '23:00'} น. วันก่อนส่ง) วันนี้สั่งได้เฉพาะเมนูไม่บ่ม หรือกรุณาเลือกวันถัดไปค่ะ` 
                };
            }
        }

        const [rCutoffH, rCutoffM] = (round.cutoffTime || '06:00').split(':').map(Number);
        const roundDeadline = new Date(y, m - 1, d, rCutoffH, rCutoffM, 59, 999);

        if (now.getTime() > roundDeadline.getTime()) {
            return { 
                available: false, 
                reason: `ปิดรับแล้วเมื่อ ${round.cutoffTime} น. (เกินเวลาตัดรอบ)` 
            };
        }

        return { available: true };
    }

    onMount(async () => {
        // โหลดข้อมูลเดิมที่เคยกรอกไว้เพื่อความสะดวก
        const storedUserData = localStorage.getItem('userData');
        if (storedUserData) {
            try {
                const parsed = JSON.parse(storedUserData);
                recipientName = parsed.name || '';
                phone = parsed.phone || '';
                address = parsed.address || '';
                sellerMessage = parsed.message || '';
                if (parsed.deliveryDate) selectedDateStr = parsed.deliveryDate;
                if (parsed.deliveryRoundId) selectedRoundId = parsed.deliveryRoundId;
            } catch (e) {
                console.error(e);
            }
        }

        // หากล็อกอินสมาชิกอยู่ ให้ใช้ชื่อและเบอร์โทรของสมาชิกอัตโนมัติ
        if (memberCtx?.member) {
            recipientName = memberCtx.member.fullName || recipientName;
            phone = memberCtx.member.phone || phone;
        }

        // โหลดตารางวันและรอบส่งจาก Settings API
        try {
            const res = await fetch('/api/settings');
            if (res.ok) {
                const data = await res.json();
                scheduleDays = data.days || [];
                storeSettings = data.settings || null;

                // เลือกวันแรกที่สามารถสั่งได้ (ข้ามวันที่เลยเวลาตัดรอบของวันนี้ไปหาวันถัดไปที่ยังสั่งได้)
                if (orderableDates.length > 0) {
                    const currentSelectedValid = orderableDates.some(d => d.dateStr === selectedDateStr) &&
                        (!hasFermentedItem || isDateValidForFermented(selectedDateStr));
                    if (!selectedDateStr || !currentSelectedValid) {
                        const firstValidDate = hasFermentedItem
                            ? (orderableDates.find(d => isDateValidForFermented(d.dateStr)) || orderableDates[0])
                            : orderableDates[0];
                        selectedDateStr = firstValidDate.dateStr;
                    }
                } else if (allDisplayDates.length > 0) {
                    selectedDateStr = allDisplayDates[0].dateStr;
                }
            }
        } catch (e) {
            console.error('Error fetching settings in location:', e);
        }
    });

    function applyPreset(preset: string) {
        if (address) {
            address += ' ' + preset;
        } else {
            address = preset;
        }
    }

    async function handleConfirmLocation(e: Event) {
        e.preventDefault();

        const trimmedName = recipientName.trim();
        const trimmedPhone = phone.trim();
        const trimmedAddress = address.trim();

        if (!trimmedName || !trimmedPhone || !trimmedAddress) {
            errorMessage = 'กรุณากรอกชื่อผู้รับ เบอร์โทรศัพท์ และสถานที่จัดส่งให้ครบถ้วน';
            return;
        }

        if (cart.count === 0) {
            swal.fire({
                icon: 'warning',
                title: 'ไม่มีสินค้าในตะกร้า',
                text: 'กรุณาเลือกเครื่องดื่มก่อนดำเนินการชำระเงิน',
                confirmButtonColor: '#456f2f'
            }).then(() => {
                goto('/menu');
            });
            return;
        }

        if (!selectedDateStr) {
            errorMessage = 'กรุณาเลือกวันที่ต้องการให้จัดส่งเครื่องดื่ม';
            return;
        }

        // ตรวจสอบความถูกต้องของรอบส่งที่เลือก
        const activeRounds = selectedDayInfo?.availableRounds || storeSettings?.deliveryRounds || [];
        const chosenRound = activeRounds.find((r: any) => r.id === selectedRoundId);

        if (!chosenRound) {
            errorMessage = 'กรุณาเลือกรอบเวลาจัดส่ง';
            return;
        }

        const availCheck = getRoundAvailability(chosenRound, selectedDateStr);
        if (!availCheck.available) {
            errorMessage = availCheck.reason || 'รอบเวลาจัดส่งที่เลือกไม่พร้อมให้บริการ กรุณาเลือกใหม่';
            swal.fire({
                icon: 'warning',
                title: 'รอบจัดส่งนี้ไม่พร้อมบริการ',
                text: errorMessage,
                confirmButtonColor: '#456f2f'
            });
            return;
        }

        errorMessage = '';
        isSubmitting = true;

        const customerData = {
            name: trimmedName,
            phone: trimmedPhone,
            address: trimmedAddress,
            message: sellerMessage.trim(),
            totalPrice: cart.total,
            deliveryDate: selectedDateStr,
            deliveryRound: `${chosenRound.name} (${chosenRound.timeSlot})`,
            deliveryRoundId: chosenRound.id
        };

        // บันทึกลง LocalStorage
        localStorage.setItem('userData', JSON.stringify(customerData));
        localStorage.setItem('phone', JSON.stringify(trimmedPhone));

        try {
            // เรียก API สร้าง QR Code จากฝั่ง Backend
            const res = await fetch('/api/qrcode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ totalPrice: cart.total })
            });

            if (res.ok) {
                const result = await res.json();
                if (result.qrDataUrl) {
                    localStorage.setItem('qrDataUrl', result.qrDataUrl);
                }
            }
        } catch (err) {
            console.error('Error fetching QR from API:', err);
        } finally {
            isSubmitting = false;
            goto('/checkout');
        }
    }
</script>

<svelte:head>
    <title>ระบุสถานที่และรอบจัดส่ง | Home Matcha Cafe</title>
</svelte:head>

<main class="menu-page-wrapper">
    <!-- Stepper Navigation -->
    <div class="checkout-steps">
        <div class="step-item done">
            <div class="step-circle">✓</div>
            <span>เลือกเมนู</span>
        </div>
        <div class="step-line done"></div>
        <div class="step-item active">
            <div class="step-circle">2</div>
            <span>สถานที่ & รอบส่ง</span>
        </div>
        <div class="step-line"></div>
        <div class="step-item">
            <div class="step-circle">3</div>
            <span>ชำระเงิน</span>
        </div>
    </div>

    <div class="form-card">
        <div style="margin-bottom: 1.5rem; text-align: left;">
            <span class="status-pill open" style="margin-bottom: 0.5rem;">จัดส่งฟรีใน รพ.ทองผาภูมิ · บ้านพัก · แฟลต</span>
            <h1 style="margin: 0 0 0.35rem 0; font-size: 1.5rem; color: var(--matcha-deep);">ข้อมูลผู้รับและรอบจัดส่ง</h1>
            <p style="margin: 0; font-size: 0.875rem; color: var(--text-secondary);">
                กรุณาระบุข้อมูลและเลือกรอบเวลาที่ต้องการให้จัดส่งเครื่องดื่มค่ะ
            </p>
        </div>

        {#if hasFermentedItem}
            <div style="background: #fefce8; border: 1.5px solid #facc15; border-radius: 14px; padding: 0.85rem 1rem; margin-bottom: 1.25rem; display: flex; align-items: flex-start; gap: 0.75rem;">
                <span style="font-size: 1.5rem; line-height: 1;">🍵</span>
                <div>
                    <h4 style="margin: 0; font-size: 0.92rem; color: #854d0e; font-weight: 700;">
                        ในตะกร้าของคุณมีเมนู "มัทฉะบ่มสกัดเย็น"
                    </h4>
                    <p style="margin: 0.2rem 0 0 0; font-size: 0.78rem; color: #a16207; line-height: 1.4;">
                        เมนูบ่มต้องสั่งล่วงหน้าก่อน <strong>{storeSettings?.fermentedCutoffTime || '23:00'} น.</strong> ก่อนวันเปิดร้าน (สั่งทันเวลาสามารถเลือกส่งได้<strong>ทั้งรอบเช้า รอบเที่ยง/บ่าย หรือวันถัด ๆ ไป</strong>ค่ะ หากเลย {storeSettings?.fermentedCutoffTime || '23:00'} น. จะสั่งส่งวันถัดไปได้เฉพาะเมนูไม่บ่ม)
                    </p>
                </div>
            </div>
        {/if}

        <form onsubmit={handleConfirmLocation}>
            <!-- ส่วนเลือกวันและรอบจัดส่ง -->
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 1.1rem; margin-bottom: 1.25rem;">
                <h3 style="margin: 0 0 0.85rem 0; font-size: 1rem; color: var(--matcha-deep); display: flex; align-items: center; gap: 0.4rem;">
                    <span>🚚 เลือกวันที่และรอบเวลาจัดส่ง</span>
                    <span style="color: var(--red-accent);">*</span>
                </h3>

                <!-- เลือกวันที่ -->
                <div class="form-group" style="margin-bottom: 1rem;">
                    <label class="form-label" for="deliveryDate">
                        <span>วันที่ต้องการให้จัดส่ง</span>
                    </label>
                    {#if orderableDates.length === 0}
                        <div style="padding: 0.9rem 1.1rem; background: #fff1f2; border: 1.5px solid #fecdd3; border-radius: 12px; color: #be123c; font-size: 0.88rem; line-height: 1.5;">
                            ⚠️ <strong>ขณะนี้ร้านยังไม่เปิดรับออเดอร์</strong><br>
                            ขออภัยในความไม่สะดวกนะคะ 🍵 ไม่มีรอบจัดส่งที่สามารถสั่งได้ในระยะเวลาที่กำหนด กรุณากลับมาสั่งใหม่อีกครั้งนะคะ
                        </div>
                    {:else}
                        <select 
                            id="deliveryDate" 
                            class="form-input" 
                            bind:value={selectedDateStr}
                            style="font-weight: 600;"
                        >
                            {#each allDisplayDates as day}
                                {@const isPastCutoffs = Boolean(day.isPastAllCutoffs)}
                                {@const fermentedOk = isDateValidForFermented(day.dateStr)}
                                <option value={day.dateStr} disabled={isPastCutoffs}>
                                    วัน{day.dayNameTh}ที่ {day.dayNum} {day.monthNameTh} ({day.dateStr}) - {isPastCutoffs ? '⛔ ปิดรับรอบวันนี้แล้ว (เลยเวลาตัดรอบ)' : hasFermentedItem ? (fermentedOk ? '✓ สั่งเมนูบ่มได้ (เลือกได้ทุกรอบ)' : '⚠️ เลยเวลาเมนูบ่ม (ได้เฉพาะเมนูไม่บ่ม)') : '✓ เปิดรับออเดอร์'}
                                </option>
                            {/each}
                        </select>
                    {/if}
                </div>

                <!-- เลือกรอบเวลาส่ง -->
                <div class="form-group" style="margin-bottom: 0;">
                    <label class="form-label" for="deliveryRoundSelect">
                        <span>รอบเวลาจัดส่ง (คลิกเลือกรอบที่ต้องการ)</span>
                    </label>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem;" id="deliveryRoundSelect">
                        {#each (selectedDayInfo?.availableRounds || storeSettings?.deliveryRounds || []) as round}
                            {@const status = getRoundAvailability(round, selectedDateStr)}
                            {@const isAllDay = round.id === 'allday' || Boolean(round.isAllDayOpen)}
                            <!-- svelte-ignore a11y_click_events_have_key_events -->
                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                            <div 
                                onclick={() => { if (status.available) selectedRoundId = round.id; }}
                                style="
                                    border: 2px solid {selectedRoundId === round.id && status.available ? 'var(--matcha-primary)' : '#cbd5e1'};
                                    background: {selectedRoundId === round.id && status.available ? 'rgba(52, 84, 39, 0.08)' : status.available ? '#ffffff' : '#f1f5f9'};
                                    border-radius: 12px;
                                    padding: 0.85rem;
                                    cursor: {status.available ? 'pointer' : 'not-allowed'};
                                    opacity: {status.available ? '1' : '0.6'};
                                    transition: all 0.2s;
                                "
                            >
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                                    <strong style="color: {selectedRoundId === round.id && status.available ? 'var(--matcha-deep)' : '#334155'}; font-size: 0.95rem;">
                                        {isAllDay ? '🕘 ' : round.id === 'morning' ? '🌤 ' : '☀️ '}{round.name}
                                    </strong>
                                    {#if selectedRoundId === round.id && status.available}
                                        <span style="color: var(--matcha-primary); font-weight: 800; font-size: 0.85rem;">✓ เลือกแล้ว</span>
                                    {/if}
                                </div>
                                <div style="font-size: 0.825rem; color: #475569; font-weight: 600;">
                                    เวลาส่ง: {round.timeSlot}
                                </div>
                                {#if !status.available}
                                    <div style="font-size: 0.72rem; color: #dc2626; margin-top: 0.35rem; font-weight: 600; line-height: 1.3;">
                                        ⚠️ {status.reason}
                                    </div>
                                {:else if hasFermentedItem}
                                    <div style="font-size: 0.72rem; color: #16a34a; margin-top: 0.25rem; line-height: 1.35;">
                                        ✓ สั่งเมนูบ่มล่วงหน้าทันเวลา (ปิดรับ {storeSettings?.fermentedCutoffTime || '23:00'} น. วันก่อนส่ง)
                                    </div>
                                {:else if isAllDay}
                                    <div style="font-size: 0.72rem; color: #16a34a; margin-top: 0.25rem; line-height: 1.35;">
                                        ✨ เมนูไม่บ่มสั่งได้ตลอดจนถึง {round.cutoffTime} น.
                                    </div>
                                {:else}
                                    <div style="font-size: 0.72rem; color: #16a34a; margin-top: 0.25rem;">
                                        เมนูไม่บ่มสั่งได้ถึง {round.cutoffTime} น. ของวันส่ง
                                    </div>
                                {/if}
                            </div>
                        {/each}
                    </div>
                </div>
            </div>

            <!-- ข้อมูลผู้สั่งและสถานที่ -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem;">
                <div class="form-group">
                    <label class="form-label" for="recipientName">
                        <span>ชื่อผู้รับ / ผู้สั่ง</span>
                        <span style="color: var(--red-accent);">*</span>
                    </label>
                    <input 
                        id="recipientName"
                        type="text" 
                        class="form-input" 
                        bind:value={recipientName} 
                        placeholder="เช่น คุณพยาบาลมด, หมอเอก" 
                        required 
                    />
                </div>

                <div class="form-group">
                    <label class="form-label" for="phone">
                        <span>เบอร์โทรศัพท์ติดต่อ</span>
                        <span style="color: var(--red-accent);">*</span>
                    </label>
                    <input 
                        id="phone"
                        type="tel" 
                        class="form-input" 
                        bind:value={phone} 
                        placeholder="08x-xxx-xxxx" 
                        required 
                    />
                </div>
            </div>

            <div class="form-group">
                <label class="form-label" for="address">
                    <span>ตึก / แผนก / ห้องจัดส่ง (รพ.ทองผาภูมิ / บ้านพัก / แฟลต)</span>
                    <span style="color: var(--red-accent);">*</span>
                </label>
                <textarea 
                    id="address"
                    class="form-textarea" 
                    rows="2" 
                    bind:value={address} 
                    placeholder="เช่น ตึกผู้ป่วยใน ชั้น 3 ห้องพยาบาล หรือ บ้านพักพยาบาลแถว 2 หลังที่ 4" 
                    required
                ></textarea>
                
                <div style="margin-top: 0.25rem;">
                    <span style="font-size: 0.75rem; color: var(--text-muted);">กดเลือกแผนกด่วน:</span>
                    <div class="preset-chips-list">
                        {#each hospitalPresets as preset}
                            <button 
                                type="button" 
                                class="preset-chip" 
                                onclick={() => applyPreset(preset)}
                            >
                                + {preset}
                            </button>
                        {/each}
                    </div>
                </div>
            </div>

            <div class="form-group">
                <label class="form-label" for="sellerMessage">
                    <span>หมายเหตุถึงบาริสต้า (ถ้ามี)</span>
                </label>
                <input 
                    id="sellerMessage"
                    type="text" 
                    class="form-input" 
                    bind:value={sellerMessage} 
                    placeholder="เช่น แยกน้ำแข็ง, วางไว้ที่เคาน์เตอร์พยาบาล" 
                />
            </div>

            <!-- สรุปรายการในตะกร้า -->
            <div style="background: var(--matcha-tint); border: 1px solid var(--border-matcha); border-radius: var(--radius-md); padding: 1rem; margin: 1.5rem 0;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                    <span style="font-weight: 700; color: var(--matcha-deep);">สรุปคำสั่งซื้อ ({cart.count} แก้ว)</span>
                    <span style="font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 1.2rem; color: var(--matcha-dark);">{cart.total} บาท</span>
                </div>
                {#if cart.items.length > 0}
                    <div style="font-size: 0.825rem; color: var(--text-secondary); display: flex; flex-direction: column; gap: 0.25rem;">
                        {#each cart.items as it}
                            <div style="display: flex; justify-content: space-between;">
                                <span>• {it.thaiName || it.name} (หวาน {it.sweetness ?? 50}%) x{it.quantity}</span>
                                <span>{(it.price || 0) * (it.quantity || 1)} ฿</span>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>

            {#if errorMessage}
                <div style="background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c; padding: 0.75rem 1rem; border-radius: var(--radius-md); font-size: 0.85rem; font-weight: 600; margin-bottom: 1rem;">
                    ⚠️ {errorMessage}
                </div>
            {/if}

            <button 
                type="submit" 
                class="btn-matcha-primary" 
                style="width: 100%; padding: 0.95rem; font-size: 1.05rem;"
                disabled={isSubmitting || orderableDates.length === 0}
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                    <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
                {isSubmitting ? 'กำลังบันทึกข้อมูล...' : 'ดำเนินการชำระเงิน (ไปหน้า QR Code)'}
            </button>
        </form>
    </div>
</main>
