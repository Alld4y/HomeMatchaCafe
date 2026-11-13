<script lang="ts">
	import { goto } from '$app/navigation';
	import { getContext, onMount } from 'svelte';
	import swal from 'sweetalert2';

	interface MenuCategory {
		id: string;
		name: string;
		icon: string;
		sortOrder: number;
	}

	interface MenuItem {
		id: string;
		thaiName: string;
		englishName: string;
		price: number;
		category: string;
		description: string;
		notes?: string;
		imageUrl?: string;
		isPromotion: boolean;
		isSignature?: boolean;
		isAvailable?: boolean;
		tags: string[];
	}

	const cart = getContext<any>('cartData');

	let categories = $state<MenuCategory[]>([
		{ id: 'clear', name: 'ชงใส (Clear)', icon: '🌿', sortOrder: 1 },
		{ id: 'latte', name: 'ลาเต้ (Latte)', icon: '🥛', sortOrder: 2 },
		{ id: 'fruit', name: 'ผลไม้สด (Fruit)', icon: '🥥', sortOrder: 3 },
		{ id: 'special', name: 'สูตรพิเศษ (Signature)', icon: '✨', sortOrder: 4 }
	]);

	let allItems = $state<MenuItem[]>([
		{
			id: 'pure-matcha',
			thaiName: 'เพียวมัทฉะ',
			englishName: 'PURE MATCHA',
			price: 50,
			category: 'clear',
			description: 'มัทฉะเกรดพิธีการแท้ตีด้วยน้ำแร่ หอมเข้ม สดชื่น ไร้นม ดื่มง่ายดีต่อสุขภาพ',
			isPromotion: false,
			tags: ['0% Fat', 'คลีนแท้', 'ไม่มีนม']
		},
		{
			id: 'matcha-latte',
			thaiName: 'มัทฉะลาเต้',
			englishName: 'MATCHA LATTE',
			price: 55,
			category: 'latte',
			description: 'มัทฉะเข้มข้นผสานนมสดแท้รสละมุน หอมมันกลมกล่อมลงตัว รสสัมผัสยอดนิยม',
			isPromotion: false,
			tags: ['เมนูยอดฮิต', 'นมสดแท้']
		},
		{
			id: 'matcha-coconut',
			thaiName: 'มัทฉะมะพร้าว',
			englishName: 'MATCHA COCONUT',
			price: 60,
			category: 'fruit',
			description: 'มัทฉะแท้เลเยอร์บนน้ำมะพร้าวน้ำหอมแท้ 100% หวานธรรมชาติ ดื่มแล้วสดชื่นสุดใจ',
			isPromotion: true,
			tags: ['มะพร้าวน้ำหอม', 'หวานธรรมชาติ', 'แนะนำ ✨']
		},
		{
			id: 'matcha-oat-latte',
			thaiName: 'มัทฉะลาเต้นมโอ๊ต',
			englishName: 'MATCHA OAT LATTE',
			price: 65,
			category: 'latte',
			description:
				'มัทฉะจับคู่กับนมโอ๊ตสูตรบาริสต้าพรีเมียม หอมนวล รสสัมผัสครีมมี่ Plant-Based 100%',
			isPromotion: false,
			tags: ['Plant-Based', 'นมโอ๊ต 100%', 'Vegan']
		},
		{
			id: 'cold-fermented-matcha-oat-latte',
			thaiName: 'มัทฉะลาเต้นมโอ๊ตบ่ม',
			englishName: 'COLD FERMENTED MATCHA OAT LATTE',
			price: 70,
			category: 'special',
			description:
				'กรรมวิธีบ่มสกัดเย็นพิเศษ เพิ่มมิติรสชาติ Umami นุ่มละมุนลึกซึ้ง เอกลักษณ์เฉพาะร้าน',
			isPromotion: true,
			tags: ['Signature 🍵', 'Cold Ferment', 'พรีเมียมพิเศษ']
		}
	]);

	let selectedCategory = $state('all');
	let availableItems = $derived(allItems.filter((item) => item.isAvailable !== false));
	let filteredItems = $derived(
		selectedCategory === 'all'
			? availableItems
			: availableItems.filter((item) => item.category === selectedCategory)
	);

	onMount(async () => {
		try {
			const res = await fetch('/api/menus');
			if (res.ok) {
				const data = await res.json();
				if (Array.isArray(data.categories) && data.categories.length > 0) {
					categories = data.categories;
				}
				if (Array.isArray(data.items) && data.items.length > 0) {
					allItems = data.items;
				}
			}
		} catch (e) {
			console.error('Failed to load dynamic menus:', e);
		}
	});

	function getMenuImageSrc(item: MenuItem): string {
		if (item.imageUrl && item.imageUrl.trim() !== '') {
			return item.imageUrl;
		}
		return `/image/${item.id}.jpg`;
	}

	function handleImgError(e: Event) {
		const target = e.currentTarget as HTMLImageElement;
		if (target && !target.src.endsWith('/image/pure-matcha.jpg')) {
			target.src = '/image/pure-matcha.jpg';
		}
	}

	function handleClearCart() {
		swal
			.fire({
				title: 'ล้างตะกร้าสินค้า?',
				text: 'คุณต้องการลบสินค้าทั้งหมดออกจากตะกร้าใช่หรือไม่',
				icon: 'warning',
				showCancelButton: true,
				confirmButtonColor: '#d9483b',
				cancelButtonColor: '#7d8e78',
				confirmButtonText: 'ใช่, ล้างตะกร้า',
				cancelButtonText: 'ยกเลิก'
			})
			.then((result) => {
				if (result.isConfirmed) {
					cart.clearCart();
				}
			});
	}

	function handleProceedCheckout() {
		if (cart.count === 0) {
			swal.fire({
				icon: 'warning',
				title: 'ไม่มีสินค้าในตะกร้า',
				text: 'กรุณาเลือกเครื่องดื่มมัทฉะที่ต้องการก่อนสั่งซื้อนะครับ',
				confirmButtonColor: '#456f2f',
				confirmButtonText: 'ตกลง'
			});
			return;
		}
		goto('/location');
	}
</script>

<svelte:head>
	<title>เมนูเครื่องดื่มมัทฉะ | Home Matcha Cafe</title>
</svelte:head>

<main class="menu-page-wrapper">
	<div class="menu-header">
		<span class="menu-header-badge">🍵 ARTISANAL MATCHA MENU</span>
		<h1 class="menu-main-title">เมนูเครื่องดื่มมัทฉะ</h1>
		<p class="menu-subtitle">
			คัดสรรผงมัทฉะแท้เกรดพรีเมียม ชงสดแก้วต่อแก้ว เลือกระดับความหวานและนมได้ตามใจคุณ
		</p>
	</div>

	<!-- Dynamic Category Tabs -->
	<div class="category-filter-bar">
		<button
			class="category-tab-btn {selectedCategory === 'all' ? 'active' : ''}"
			onclick={() => (selectedCategory = 'all')}
		>
			ทั้งหมด ({availableItems.length})
		</button>
		{#each categories as cat}
			<button
				class="category-tab-btn {selectedCategory === cat.id ? 'active' : ''}"
				onclick={() => (selectedCategory = cat.id)}
			>
				{cat.icon} {cat.name}
			</button>
		{/each}
	</div>

	<!-- Menu Items Grid -->
	<div class="menu-grid">
		{#each filteredItems as item}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<div
				class="menu-card"
				role="button"
				tabindex="0"
				onclick={() => goto(`/order/${item.id}`)}
				onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && goto(`/order/${item.id}`)}
			>
				<div class="menu-card-top">
					<div class="menu-card-img-wrap">
						<img
							oncontextmenu={(e) => e.preventDefault()}
							onerror={handleImgError}
							class="menu-card-img protect-img"
							src={getMenuImageSrc(item)}
							alt={item.englishName}
						/>
						{#if item.isPromotion}
							<span class="menu-card-badge">PROMO</span>
						{:else if item.isSignature}
							<span class="menu-card-badge" style="background: #2d5a27;">SIGNATURE</span>
						{/if}
					</div>

					<div class="menu-card-info">
						<h3 class="menu-card-thai-name">{item.thaiName}</h3>
						<p class="menu-card-eng-name">{item.englishName}</p>
						<p class="menu-card-desc">{item.description}</p>

						<div class="menu-card-tags">
							{#each item.tags || [] as tag}
								<span
									class="menu-tag {tag.includes('แนะนำ') || tag.includes('Signature')
										? 'highlight'
										: ''}">{tag}</span
								>
							{/each}
						</div>
					</div>
				</div>

				<div class="menu-card-bottom">
					<div class="menu-card-price-box">
						<span class="menu-card-price-label">ราคา / Price</span>
						<div class="menu-card-price">{item.price} <span>บาท</span></div>
					</div>

					<div class="menu-card-actions">
						<button
							class="btn-order-card"
							onclick={(e) => {
								e.stopPropagation();
								goto(`/order/${item.id}`);
							}}
							title="กดเพื่อเลือกระดับความหวานและปรับแต่งเครื่องดื่ม"
						>
							<span class="btn-order-plus">+</span>
							<span>เลือกระดับความหวาน</span>
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"
							>
								<path d="M5 12h14M12 5l7 7-7 7" />
							</svg>
						</button>
					</div>
				</div>
			</div>
		{/each}
	</div>

	<!-- Sticky Bottom Cart Bar เมื่อมีสินค้าในตะกร้า -->
	{#if cart.count > 0}
		<div class="sticky-checkout-bar">
			<div class="sticky-bar-left">
				<div class="sticky-cart-icon-box">🍵</div>
				<div class="sticky-bar-info">
					<span class="sticky-bar-count">ในตะกร้า {cart.count} แก้ว</span>
					<span class="sticky-bar-total">{cart.total} ฿</span>
				</div>
			</div>

			<div class="sticky-bar-actions">
				<button onclick={handleClearCart} class="btn-sticky-clear" title="ล้างตะกร้า">
					ล้าง
				</button>
				<button onclick={handleProceedCheckout} class="btn-sticky-checkout">
					ไปหน้าชำระเงิน →
				</button>
			</div>
		</div>
	{/if}
</main>
