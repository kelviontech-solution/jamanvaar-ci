import { useCallback, useEffect, useState, useRef } from 'react';
import { api, ApiError } from '../../api/client';
import type { MasterMenuCategory, MasterMenuItem, RestaurantListItem } from '../../api/types';
import {
  Badge,
  Button,
  Card,
  Modal,
  SearchBar,
  ConfirmModal
} from '../../components/ui';
import {
  Utensils,
  Plus,
  Send,
  RefreshCw,
  Clock,
  Sparkles,
  Tag,
  LayoutGrid,
  Table as TableIcon,
  FolderPlus,
  Edit2,
  Trash2,
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Layers,
  BookOpen
} from 'lucide-react';
import '../../components/shared.css';
import './master-catalog.css';

export function MasterCatalogPage() {
  const [categories, setCategories] = useState<MasterMenuCategory[]>([]);
  const [items, setItems] = useState<MasterMenuItem[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantListItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [dietaryFilter, setDietaryFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'CARDS' | 'TABLE'>('CARDS');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Add / Edit Item Modal
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MasterMenuItem | null>(null);
  const [dishName, setDishName] = useState('');
  const [dishCategory, setDishCategory] = useState('');
  const [dishPrice, setDishPrice] = useState('320');
  const [dishDiet, setDishDiet] = useState<'VEG' | 'NON_VEG' | 'VEGAN' | 'JAIN' | 'SWAMINARAYAN'>('VEG');
  const [dishDesc, setDishDesc] = useState('');
  const [dishPrepTime, setDishPrepTime] = useState('15');
  const [dishHsn, setDishHsn] = useState('996331');
  const [dishIngredients, setDishIngredients] = useState('');
  const [dishRecipeMethod, setDishRecipeMethod] = useState('');
  const [dishImageUrl, setDishImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [savingItem, setSavingItem] = useState(false);

  // Category Manager Modal
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatSlug, setNewCatSlug] = useState('');
  const [editingCat, setEditingCat] = useState<MasterMenuCategory | null>(null);
  const [savingCat, setSavingCat] = useState(false);

  // Delete Dish Confirm
  const [deleteTarget, setDeleteTarget] = useState<MasterMenuItem | null>(null);
  const [deletingItem, setDeletingItem] = useState(false);

  // Import Starter Library
  const [importingLibrary, setImportingLibrary] = useState(false);

  // Syndication Modal
  const [syndicateTarget, setSyndicateTarget] = useState<MasterMenuItem | null>(null);
  const [selectedRestIds, setSelectedRestIds] = useState<Set<string>>(new Set());
  const [syndicating, setSyndicating] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3800);
  };

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<MasterMenuCategory[]>('/api/v1/master-catalog/categories'),
      api.get<MasterMenuItem[]>('/api/v1/master-catalog/items'),
      api.get<RestaurantListItem[]>('/api/v1/restaurants')
    ])
      .then(([cats, itms, rests]) => {
        setCategories(cats);
        setItems(itms);
        setRestaurants(rests);
        if (cats.length > 0 && !dishCategory) {
          setDishCategory(cats[0].id);
        }
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load master catalog'))
      .finally(() => setLoading(false));
  }, [dishCategory]);

  useEffect(loadData, [loadData]);

  const filteredItems = items.filter((item) => {
    if (selectedCategory !== 'ALL' && item.categoryId !== selectedCategory) return false;
    if (dietaryFilter !== 'ALL' && item.dietaryType !== dietaryFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = item.name.toLowerCase().includes(q);
      const matchDesc = (item.description || '').toLowerCase().includes(q);
      if (!matchName && !matchDesc) return false;
    }
    return true;
  });

  // Open Create Modal
  const handleOpenAddModal = () => {
    setEditingItem(null);
    setDishName('');
    setDishCategory(categories[0]?.id || '');
    setDishPrice('320');
    setDishDiet('VEG');
    setDishDesc('');
    setDishPrepTime('15');
    setDishHsn('996331');
    setDishIngredients('');
    setDishRecipeMethod('');
    setDishImageUrl(null);
    setItemModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (item: MasterMenuItem) => {
    setEditingItem(item);
    setDishName(item.name);
    setDishCategory(item.categoryId);
    setDishPrice(String(Math.round(item.basePrice / 100)));
    setDishDiet(item.dietaryType);
    setDishDesc(item.description || '');
    setDishPrepTime(String(item.preparationTimeMinutes || 15));
    setDishHsn(item.hsnCode || '996331');
    setDishIngredients(Array.isArray(item.recipe?.ingredients) ? item.recipe.ingredients.join('\n') : '');
    setDishRecipeMethod(typeof item.recipe?.method === 'string' ? item.recipe.method : '');
    setDishImageUrl(item.imageUrl || null);
    setItemModalOpen(true);
  };

  // Save Dish (Create or Update)
  const handleSaveDish = async () => {
    if (!dishName.trim() || !dishCategory) return;
    setSavingItem(true);
    try {
      const ingredientsList = dishIngredients
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        name: dishName.trim(),
        categoryId: dishCategory,
        basePrice: Math.round(parseFloat(dishPrice) * 100),
        dietaryType: dishDiet,
        description: dishDesc.trim(),
        preparationTimeMinutes: parseInt(dishPrepTime, 10) || 15,
        taxRate: 500, // 5% GST
        hsnCode: dishHsn.trim() || '996331',
        imageUrl: dishImageUrl || undefined,
        recipe: {
          ingredients: ingredientsList,
          method: dishRecipeMethod.trim()
        }
      };

      if (editingItem) {
        await api.patch(`/api/v1/master-catalog/items/${editingItem.id}`, payload);
        showToast(`Master dish "${dishName}" updated successfully`);
      } else {
        await api.post('/api/v1/master-catalog/items', payload);
        showToast(`Master dish "${dishName}" created successfully`);
      }
      setItemModalOpen(false);
      loadData();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to save master dish', 'error');
    } finally {
      setSavingItem(false);
    }
  };

  // Delete Dish
  const handleDeleteDish = async () => {
    if (!deleteTarget) return;
    setDeletingItem(true);
    try {
      await api.delete(`/api/v1/master-catalog/items/${deleteTarget.id}`);
      showToast(`Master dish "${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
      loadData();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to delete master dish', 'error');
    } finally {
      setDeletingItem(false);
    }
  };

  // Image Upload Handler
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast('Image exceeds 5MB maximum limit', 'error');
      return;
    }

    setUploadingImage(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = reader.result as string;
        const res = await api.post<{ url: string }>('/api/v1/master-catalog/upload-image', {
          fileName: file.name,
          contentType: file.type,
          base64Data
        });
        setDishImageUrl(res.url);
        showToast('Image uploaded successfully');
      };
      reader.readAsDataURL(file);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Image upload failed', 'error');
    } finally {
      setUploadingImage(false);
    }
  };

  // Import Starter Library
  const handleImportStarterLibrary = async () => {
    setImportingLibrary(true);
    try {
      const res = await api.post<{ categoriesCount: number; dishesCreated: number; dishesUpdated: number }>(
        '/api/v1/master-catalog/import-starter-library',
        {}
      );
      showToast(`Imported ${res.dishesCreated} new dishes across ${res.categoriesCount} categories`);
      loadData();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to import starter library', 'error');
    } finally {
      setImportingLibrary(false);
    }
  };

  // Save Category
  const handleSaveCategory = async () => {
    if (!newCatName.trim()) return;
    setSavingCat(true);
    try {
      const slug = newCatSlug.trim() || newCatName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if (editingCat) {
        await api.patch(`/api/v1/master-catalog/categories/${editingCat.id}`, {
          name: newCatName.trim(),
          slug
        });
        showToast(`Category "${newCatName}" updated`);
      } else {
        await api.post('/api/v1/master-catalog/categories', {
          name: newCatName.trim(),
          slug
        });
        showToast(`Category "${newCatName}" created`);
      }
      setNewCatName('');
      setNewCatSlug('');
      setEditingCat(null);
      loadData();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to save category', 'error');
    } finally {
      setSavingCat(false);
    }
  };

  // Delete Category
  const handleDeleteCategory = async (cat: MasterMenuCategory) => {
    if (!confirm(`Delete category "${cat.name}"?`)) return;
    try {
      await api.delete(`/api/v1/master-catalog/categories/${cat.id}`);
      showToast(`Category "${cat.name}" deleted`);
      loadData();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Cannot delete category with active dishes', 'error');
    }
  };

  // Syndication modal
  const openSyndicateModal = (item: MasterMenuItem) => {
    setSyndicateTarget(item);
    setSelectedRestIds(new Set(restaurants.map((r) => r.id)));
  };

  const toggleRestaurantSelection = (id: string) => {
    setSelectedRestIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExecuteSyndication = async () => {
    if (!syndicateTarget || selectedRestIds.size === 0) return;
    setSyndicating(true);
    try {
      await api.post(`/api/v1/master-catalog/items/${syndicateTarget.id}/syndicate`, {
        restaurantIds: Array.from(selectedRestIds),
        autoSync: true
      });
      showToast(`Syndicated "${syndicateTarget.name}" to ${selectedRestIds.size} restaurant(s)`);
      setSyndicateTarget(null);
      loadData();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Syndication failed', 'error');
    } finally {
      setSyndicating(false);
    }
  };

  const getDietStyle = (type: string) => {
    switch (type) {
      case 'JAIN': return { class: 'dish-diet-jain', label: 'JAIN' };
      case 'SWAMINARAYAN': return { class: 'dish-diet-swami', label: 'SWAMINARAYAN' };
      case 'VEG': return { class: 'dish-diet-veg', label: 'VEG' };
      case 'NON_VEG': return { class: 'dish-diet-nonveg', label: 'NON-VEG' };
      default: return { class: 'dish-diet-vegan', label: 'VEGAN' };
    }
  };

  return (
    <div className="catalog-wrapper">
      {/* ── Page Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Master Menu Catalog & Franchise Syndication</h1>
          <p className="page-subtitle">
            Central repository of standardized recipes, authentic Indian culinary items, GST tax profiles, and safe push syndication to franchise outlets.
          </p>
        </div>
        <div className="catalog-header-actions">
          <Button variant="ghost" onClick={loadData}>
            <RefreshCw className="w-4 h-4 mr-1.5" /> Refresh
          </Button>
          <Button
            variant="ghost"
            onClick={handleImportStarterLibrary}
            disabled={importingLibrary}
            title="Import authentic preloaded Indian starter dishes and recipes"
          >
            <Sparkles className="w-4 h-4 mr-1.5 text-saffron" />
            {importingLibrary ? 'Importing Recipes…' : 'Import Starter Library'}
          </Button>
          <Button variant="ghost" onClick={() => setCategoryModalOpen(true)}>
            <FolderPlus className="w-4 h-4 mr-1.5" /> Manage Categories
          </Button>
          <Button variant="accent" onClick={handleOpenAddModal}>
            <Plus className="w-4 h-4 mr-1.5" /> Add Master Dish
          </Button>
        </div>
      </div>

      {toast && (
        <div
          className="floating-toast"
          style={{
            background: toast.type === 'error' ? '#BE123C' : '#0B253A',
            color: '#FFFFFF'
          }}
        >
          {toast.type === 'error' ? <AlertCircle className="w-4 h-4 inline mr-2" /> : <CheckCircle2 className="w-4 h-4 inline mr-2 text-emerald" />}
          {toast.msg}
        </div>
      )}

      {error && <div className="page-error">{error}</div>}

      {/* ── Category Chips Bar ── */}
      <div className="catalog-category-bar">
        <button
          type="button"
          className={`category-chip-btn ${selectedCategory === 'ALL' ? 'active' : ''}`}
          onClick={() => setSelectedCategory('ALL')}
        >
          <span>All Categories</span>
          <span className="category-chip-badge">{items.length}</span>
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`category-chip-btn ${selectedCategory === c.id ? 'active' : ''}`}
            onClick={() => setSelectedCategory(c.id)}
          >
            <span>{c.name}</span>
            <span className="category-chip-badge">{c._count?.items ?? 0}</span>
          </button>
        ))}
      </div>

      {/* ── Toolbar (Search, Filter, View Mode) ── */}
      <div className="toolbar" style={{ marginBottom: 4 }}>
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search master dishes by name or ingredients…"
          width="320px"
        />

        <select
          value={dietaryFilter}
          onChange={(e) => setDietaryFilter(e.target.value)}
          style={{ height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid var(--jv-border)', fontSize: 13, background: '#fff' }}
        >
          <option value="ALL">All Dietary Classifications</option>
          <option value="VEG">Vegetarian (VEG)</option>
          <option value="JAIN">Jain Friendly</option>
          <option value="SWAMINARAYAN">Swaminarayan</option>
          <option value="NON_VEG">Non-Vegetarian</option>
          <option value="VEGAN">100% Vegan</option>
        </select>

        {(search || dietaryFilter !== 'ALL' || selectedCategory !== 'ALL') && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSearch('');
              setDietaryFilter('ALL');
              setSelectedCategory('ALL');
            }}
          >
            Reset filters
          </button>
        )}

        <div className="spacer" />

        <div className="view-toggle-wrap">
          <button
            type="button"
            className={`view-toggle-btn ${viewMode === 'CARDS' ? 'active' : ''}`}
            onClick={() => setViewMode('CARDS')}
            title="SaaS Cards View"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Cards</span>
          </button>
          <button
            type="button"
            className={`view-toggle-btn ${viewMode === 'TABLE' ? 'active' : ''}`}
            onClick={() => setViewMode('TABLE')}
            title="Compact Table View"
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span>Table</span>
          </button>
        </div>
      </div>

      {/* ── Content View ── */}
      {loading && items.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>Loading master menu catalog…</div>
      ) : filteredItems.length === 0 ? (
        <Card style={{ padding: 48, textAlign: 'center' }}>
          <Utensils className="w-10 h-10 mx-auto text-slate-400 mb-3" />
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0B253A', marginBottom: 6 }}>No master dishes match your search</h3>
          <p style={{ fontSize: 13, color: '#64748B', maxWidth: 450, margin: '0 auto 16px' }}>
            Try clearing search keywords, or click "Import Starter Library" to automatically load 30+ authentic Indian culinary recipes.
          </p>
          <Button variant="accent" onClick={handleImportStarterLibrary} disabled={importingLibrary}>
            <Sparkles className="w-4 h-4 mr-1.5" /> Import Starter Library
          </Button>
        </Card>
      ) : viewMode === 'CARDS' ? (
        /* ═══════════════ CARDS VIEW ═══════════════ */
        <div className="dish-cards-grid">
          {filteredItems.map((dish) => {
            const diet = getDietStyle(dish.dietaryType);
            const ingredients = Array.isArray(dish.recipe?.ingredients) ? dish.recipe.ingredients : [];
            return (
              <div key={dish.id} className="dish-card">
                {/* Media Header */}
                <div className="dish-media-wrap">
                  {dish.imageUrl ? (
                    <img
                      src={dish.imageUrl}
                      alt={dish.name}
                      className="dish-img"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="dish-img-fallback">
                      <Utensils className="w-8 h-8 text-saffron" />
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em' }}>JAMANVAAR CHEF RECIPE</span>
                    </div>
                  )}
                  <div className="dish-media-overlay-top">
                    <span className={`dish-diet-pill ${diet.class}`}>● {diet.label}</span>
                    <span className="dish-prep-time">
                      <Clock className="w-3 h-3" /> {dish.preparationTimeMinutes} min
                    </span>
                  </div>
                </div>

                {/* Body */}
                <div className="dish-card-body">
                  <div className="dish-category-label">{dish.category?.name || 'General'}</div>
                  <div className="dish-title-row">
                    <h3 className="dish-name">{dish.name}</h3>
                    <div className="dish-price-wrap">
                      <div className="dish-price-amount">₹{(dish.basePrice / 100).toFixed(0)}</div>
                      <div className="dish-price-gst">+5% GST</div>
                    </div>
                  </div>

                  <p className="dish-description">{dish.description || 'Standard authentic culinary recipe formulation.'}</p>

                  {/* Recipe formulation */}
                  {ingredients.length > 0 && (
                    <div className="dish-recipe-box">
                      <div className="dish-recipe-header">
                        <BookOpen className="w-3.5 h-3.5 text-saffron" />
                        <span>Recipe Formulation ({ingredients.length} ingredients)</span>
                      </div>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ingredients.slice(0, 3).join(', ')}
                        {ingredients.length > 3 ? ` +${ingredients.length - 3} more` : ''}
                      </div>
                    </div>
                  )}

                  {/* Meta / Adoptions */}
                  <div className="dish-meta-row">
                    <span className="dish-adoption-count">
                      <Send className="w-3 h-3" /> {dish._count?.syndications ?? 0} outlet adoption(s)
                    </span>
                    <span className="dish-hsn-tag">HSN: {dish.hsnCode || '996331'}</span>
                  </div>

                  {/* Action Buttons */}
                  <div className="dish-card-actions">
                    <Button variant="ghost" size="sm" onClick={() => handleOpenEditModal(dish)}>
                      <Edit2 className="w-3.5 h-3.5 mr-1" /> Edit
                    </Button>
                    <Button variant="accent" size="sm" onClick={() => openSyndicateModal(dish)}>
                      <Send className="w-3.5 h-3.5 mr-1" /> Syndicate
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      style={{ color: '#BE123C', minWidth: 36, padding: '0 8px' }}
                      onClick={() => setDeleteTarget(dish)}
                      title="Delete dish"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ═══════════════ TABLE VIEW ═══════════════ */
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f1f5f9', textAlign: 'left', color: '#64748b' }}>
                  <th style={{ padding: '12px 14px' }}>Master Dish</th>
                  <th style={{ padding: '12px 14px' }}>Category</th>
                  <th style={{ padding: '12px 14px' }}>Dietary</th>
                  <th style={{ padding: '12px 14px' }}>Suggested Base Price</th>
                  <th style={{ padding: '12px 14px' }}>Prep Time</th>
                  <th style={{ padding: '12px 14px' }}>Franchise Adoptions</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((dish) => {
                  const diet = getDietStyle(dish.dietaryType);
                  return (
                    <tr key={dish.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          {dish.imageUrl ? (
                            <img
                              src={dish.imageUrl}
                              alt=""
                              style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover' }}
                            />
                          ) : (
                            <div style={{ width: 44, height: 44, borderRadius: 8, background: '#0B253A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                              <Utensils className="w-4 h-4 text-saffron" />
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight: 800, color: '#0B253A', fontSize: 14 }}>{dish.name}</div>
                            <div style={{ color: '#64748b', fontSize: 12, marginTop: 2, maxWidth: 360 }}>
                              {dish.description || 'Standard chef formulation'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '14px', color: '#475569', fontWeight: 600 }}>
                        {dish.category?.name || 'General'}
                      </td>
                      <td style={{ padding: '14px' }}>
                        <span className={`dish-diet-pill ${diet.class}`}>● {diet.label}</span>
                      </td>
                      <td style={{ padding: '14px' }}>
                        <span style={{ fontWeight: 900, color: '#047857', fontSize: 14 }}>
                          ₹{(dish.basePrice / 100).toFixed(0)}
                        </span>
                        <span style={{ color: '#94a3b8', fontSize: 11, marginLeft: 4 }}>+ 5% GST</span>
                      </td>
                      <td style={{ padding: '14px', color: '#64748b' }}>
                        <Clock className="w-3.5 h-3.5 inline mr-1 text-slate-400" />
                        {dish.preparationTimeMinutes} min
                      </td>
                      <td style={{ padding: '14px' }}>
                        <span style={{ fontWeight: 700, color: '#0284c7' }}>
                          {dish._count?.syndications ?? 0} outlets
                        </span>
                      </td>
                      <td style={{ padding: '14px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                          <Button variant="ghost" size="sm" onClick={() => handleOpenEditModal(dish)}>
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="accent" size="sm" onClick={() => openSyndicateModal(dish)}>
                            <Send className="w-3.5 h-3.5 mr-1" /> Syndicate
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ═══════════════ ADD / EDIT DISH MODAL ═══════════════ */}
      {itemModalOpen && (
        <Modal
          title={editingItem ? `Edit Master Dish: ${editingItem.name}` : 'Add New Master Catalog Dish'}
          onClose={() => setItemModalOpen(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '75vh', overflowY: 'auto', paddingRight: 4 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4, color: '#0B253A' }}>
                Dish Name *
              </label>
              <input
                type="text"
                placeholder="e.g. Amritsari Kulcha Platter"
                value={dishName}
                onChange={(e) => setDishName(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4, color: '#0B253A' }}>
                  Category *
                </label>
                <select
                  value={dishCategory}
                  onChange={(e) => setDishCategory(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4, color: '#0B253A' }}>
                  Dietary Classification
                </label>
                <select
                  value={dishDiet}
                  onChange={(e) => setDishDiet(e.target.value as any)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                >
                  <option value="VEG">Vegetarian (VEG)</option>
                  <option value="JAIN">Jain (No Root Vegetables)</option>
                  <option value="SWAMINARAYAN">Swaminarayan (No Onion/Garlic)</option>
                  <option value="NON_VEG">Non-Vegetarian</option>
                  <option value="VEGAN">100% Vegan</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4, color: '#0B253A' }}>
                  Suggested Base Price (₹) *
                </label>
                <input
                  type="number"
                  value={dishPrice}
                  onChange={(e) => setDishPrice(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4, color: '#0B253A' }}>
                  Kitchen Prep Time (Min)
                </label>
                <input
                  type="number"
                  value={dishPrepTime}
                  onChange={(e) => setDishPrepTime(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4, color: '#0B253A' }}>
                  HSN Tax Code
                </label>
                <input
                  type="text"
                  value={dishHsn}
                  onChange={(e) => setDishHsn(e.target.value)}
                  placeholder="996331"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4, color: '#0B253A' }}>
                Description
              </label>
              <textarea
                rows={2}
                placeholder="Culinary background, flavor notes, and presentation style…"
                value={dishDesc}
                onChange={(e) => setDishDesc(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4, color: '#0B253A' }}>
                Ingredients & Formulation (1 per line)
              </label>
              <textarea
                rows={3}
                placeholder="Paneer malai (200g)&#10;Hung curd (50g)&#10;Kashmiri degi mirch (15g)"
                value={dishIngredients}
                onChange={(e) => setDishIngredients(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4, color: '#0B253A' }}>
                Preparation Method & Kitchen Notes
              </label>
              <textarea
                rows={3}
                placeholder="Step-by-step chef method and tandoor/pan execution guide…"
                value={dishRecipeMethod}
                onChange={(e) => setDishRecipeMethod(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
              />
            </div>

            {/* Dish Image Upload */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6, color: '#0B253A' }}>
                Dish Photography & Visual Asset
              </label>
              {dishImageUrl ? (
                <div className="image-preview-wrap">
                  <img src={dishImageUrl} alt="Preview" className="image-preview-img" />
                  <button
                    type="button"
                    className="image-remove-btn"
                    onClick={() => setDishImageUrl(null)}
                    title="Remove image"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div
                  className="image-upload-zone"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png, image/jpeg, image/webp, image/svg+xml"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                  />
                  <ImageIcon className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0B253A' }}>
                    {uploadingImage ? 'Uploading dish photo…' : 'Click to upload dish photo'}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    PNG, JPG, WEBP or SVG (Max 5MB)
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <Button variant="ghost" onClick={() => setItemModalOpen(false)}>Cancel</Button>
              <Button variant="accent" onClick={handleSaveDish} disabled={savingItem || !dishName.trim()}>
                {savingItem ? 'Saving Master Dish…' : editingItem ? 'Update Master Dish' : 'Create Master Dish'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ═══════════════ CATEGORY MANAGER MODAL ═══════════════ */}
      {categoryModalOpen && (
        <Modal title="Master Menu Category Management" onClose={() => setCategoryModalOpen(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Create / Edit Form */}
            <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0B253A', marginBottom: 8 }}>
                {editingCat ? `Edit Category: ${editingCat.name}` : 'Create New Category'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <input
                  type="text"
                  placeholder="Category Name (e.g. Chaat & Street Food)"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                />
                <input
                  type="text"
                  placeholder="Slug (optional e.g. chaat-street-food)"
                  value={newCatSlug}
                  onChange={(e) => setNewCatSlug(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                {editingCat && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingCat(null);
                      setNewCatName('');
                      setNewCatSlug('');
                    }}
                  >
                    Cancel Edit
                  </Button>
                )}
                <Button variant="accent" size="sm" onClick={handleSaveCategory} disabled={savingCat || !newCatName.trim()}>
                  {savingCat ? 'Saving…' : editingCat ? 'Update Category' : '+ Add Category'}
                </Button>
              </div>
            </div>

            {/* List */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: 8 }}>
                Existing Categories ({categories.length})
              </div>
              <div className="category-manager-list">
                {categories.map((cat) => (
                  <div key={cat.id} className="category-manager-item">
                    <div>
                      <strong style={{ color: '#0B253A', fontSize: 13 }}>{cat.name}</strong>
                      <span style={{ color: '#64748B', fontSize: 12, marginLeft: 8 }}>
                        ({cat._count?.items ?? 0} dishes)
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingCat(cat);
                          setNewCatName(cat.name);
                          setNewCatSlug(cat.slug);
                        }}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        style={{ color: '#BE123C' }}
                        onClick={() => handleDeleteCategory(cat)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
              <Button variant="ghost" onClick={() => setCategoryModalOpen(false)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══════════════════════════════════════════════════════════
          DELETE CONFIRM MODAL
         ══════════════════════════════════════════════════════════ */}
      {deleteTarget && (
        <ConfirmModal
          isOpen={true}
          title={`Delete Master Dish: ${deleteTarget.name}?`}
          message="Are you sure you want to delete this master recipe from the platform catalog? This action will archive the dish and cannot be undone."
          confirmLabel={deletingItem ? 'Deleting…' : 'Delete Dish'}
          tone="danger"
          isPending={deletingItem}
          onConfirm={handleDeleteDish}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {/* ═══════════════ FRANCHISE SYNDICATION MODAL ═══════════════ */}
      {syndicateTarget && (
        <Modal title={`Syndicate Dish: ${syndicateTarget.name}`} onClose={() => setSyndicateTarget(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 12, fontSize: 13, color: '#166534' }}>
              <strong>Conflict-Safe Franchising:</strong> Pushing this master dish creates or updates restaurant menu entries without overwriting custom restaurant pricing or localized descriptions.
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: '#0B253A' }}>
                  Select Target Outlets ({selectedRestIds.size} of {restaurants.length} selected):
                </label>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => {
                    if (selectedRestIds.size === restaurants.length) setSelectedRestIds(new Set());
                    else setSelectedRestIds(new Set(restaurants.map((r) => r.id)));
                  }}
                >
                  {selectedRestIds.size === restaurants.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}>
                {restaurants.map((r) => {
                  const checked = selectedRestIds.has(r.id);
                  return (
                    <label
                      key={r.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 10px',
                        borderRadius: 6,
                        background: checked ? '#f8fafc' : 'transparent',
                        cursor: 'pointer'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRestaurantSelection(r.id)}
                      />
                      <div>
                        <strong>{r.name}</strong>
                        <span style={{ color: '#64748b', fontSize: 12, marginLeft: 8 }}>{r.city || 'India'}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <Button variant="ghost" onClick={() => setSyndicateTarget(null)}>Cancel</Button>
              <Button
                variant="accent"
                disabled={selectedRestIds.size === 0 || syndicating}
                onClick={handleExecuteSyndication}
              >
                {syndicating ? 'Pushing Updates…' : `Push to ${selectedRestIds.size} Outlet(s)`}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
