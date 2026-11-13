import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
    getAllMenuData,
    upsertMenuItem,
    deleteMenuItem,
    upsertMenuCategory,
    deleteMenuCategory,
    saveMenuImageFile
} from '$lib/server/menus';
import { getStoreSettings, updateStoreSettings } from '$lib/server/settings';

export const GET: RequestHandler = async () => {
    try {
        const data = await getAllMenuData();
        return json({
            success: true,
            categories: data.categories,
            items: data.items
        });
    } catch (err: any) {
        console.error('Error in GET /api/menus:', err);
        return json({ success: false, message: err.message || 'เกิดข้อผิดพลาดในการโหลดเมนู' }, { status: 500 });
    }
};

export const POST: RequestHandler = async ({ request }) => {
    try {
        const contentType = request.headers.get('content-type') || '';

        if (contentType.includes('multipart/form-data')) {
            const formData = await request.formData();
            const id = (formData.get('id') as string) || '';
            const thaiName = (formData.get('thaiName') as string) || '';
            const englishName = (formData.get('englishName') as string) || '';
            const price = Number(formData.get('price') || 55);
            const category = (formData.get('category') as string) || 'clear';
            const description = (formData.get('description') as string) || '';
            const notes = (formData.get('notes') as string) || '';
            const isPromotion = formData.get('isPromotion') === 'true';
            const isSignature = formData.get('isSignature') === 'true';
            const isFermented = formData.get('isFermented') === 'true';
            const isAvailable = formData.get('isAvailable') !== 'false';
            const sortOrder = Number(formData.get('sortOrder') || 10);
            const rawTags = (formData.get('tags') as string) || '[]';
            let tags: string[] = [];
            try {
                tags = JSON.parse(rawTags);
            } catch {
                tags = rawTags.split(',').map(t => t.trim()).filter(Boolean);
            }

            const rawAddons = (formData.get('addons') as string) || '[]';
            let addons: Array<{ id: string; name: string; price: number }> = [];
            try {
                const parsedAddons = JSON.parse(rawAddons);
                if (Array.isArray(parsedAddons)) {
                    addons = parsedAddons;
                }
            } catch {
                addons = [];
            }

            let imageUrl = (formData.get('imageUrl') as string) || '';
            const imageFile = formData.get('imageFile');
            if (imageFile && imageFile instanceof File && imageFile.size > 0) {
                imageUrl = await saveMenuImageFile(imageFile);
            }

            const savedItem = await upsertMenuItem({
                id,
                thaiName,
                englishName,
                price,
                category,
                description,
                notes,
                imageUrl,
                isPromotion,
                isSignature,
                isFermented,
                isAvailable,
                tags,
                addons,
                sortOrder
            });

            // ซิงค์รายการเมนูบ่มเข้ากับ store_settings อัตโนมัติ
            const settings = await getStoreSettings();
            const currentFermented = new Set(settings.fermentedItemIds || []);
            if (savedItem.isFermented) {
                currentFermented.add(savedItem.id);
            } else {
                currentFermented.delete(savedItem.id);
            }
            await updateStoreSettings({ fermentedItemIds: Array.from(currentFermented) });

            const allData = await getAllMenuData();
            return json({
                success: true,
                item: savedItem,
                categories: allData.categories,
                items: allData.items,
                message: 'บันทึกข้อมูลเมนูเรียบร้อยแล้ว'
            });
        }

        const body = await request.json();
        if (body.type === 'category') {
            const savedCat = await upsertMenuCategory({
                id: body.id,
                name: body.name,
                icon: body.icon,
                sortOrder: body.sortOrder
            });
            const allData = await getAllMenuData();
            return json({
                success: true,
                category: savedCat,
                categories: allData.categories,
                items: allData.items,
                message: 'บันทึกหมวดหมู่เรียบร้อยแล้ว'
            });
        }

        const savedItem = await upsertMenuItem(body);
        const settings = await getStoreSettings();
        const currentFermented = new Set(settings.fermentedItemIds || []);
        if (savedItem.isFermented) {
            currentFermented.add(savedItem.id);
        } else {
            currentFermented.delete(savedItem.id);
        }
        await updateStoreSettings({ fermentedItemIds: Array.from(currentFermented) });

        const allData = await getAllMenuData();
        return json({
            success: true,
            item: savedItem,
            categories: allData.categories,
            items: allData.items,
            message: 'บันทึกข้อมูลเมนูเรียบร้อยแล้ว'
        });
    } catch (err: any) {
        console.error('Error in POST /api/menus:', err);
        return json({ success: false, message: err.message || 'เกิดข้อผิดพลาดในการบันทึกเมนู' }, { status: 500 });
    }
};

export const DELETE: RequestHandler = async ({ url }) => {
    try {
        const type = url.searchParams.get('type') || 'item';
        const id = url.searchParams.get('id') || '';
        if (!id) {
            return json({ success: false, message: 'กรุณาระบุรหัสที่ต้องการลบ' }, { status: 400 });
        }

        if (type === 'category') {
            await deleteMenuCategory(id);
        } else {
            await deleteMenuItem(id);
        }

        const allData = await getAllMenuData();
        return json({
            success: true,
            categories: allData.categories,
            items: allData.items,
            message: 'ลบรายการเรียบร้อยแล้ว'
        });
    } catch (err: any) {
        console.error('Error in DELETE /api/menus:', err);
        return json({ success: false, message: err.message || 'เกิดข้อผิดพลาดในการลบ' }, { status: 500 });
    }
};
