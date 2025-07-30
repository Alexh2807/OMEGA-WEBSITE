import React, { useState, useEffect } from 'react';
import {
  Package,
  Plus,
  Edit3,
  Trash2,
  Search,
  Filter,
  Eye,
  Star,
  AlertCircle,
  Upload,
  X,
  ChevronUp,
  ChevronDown,
  Image as ImageIcon,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Product, Category } from '../../types';
import toast from 'react-hot-toast';

const AdminProducts = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [availableImages, setAvailableImages] = useState<string[]>([]);
  const [showImageSelector, setShowImageSelector] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    long_description: '',
    price: '',
    price_ht: '',
    original_price: '',
    category_id: '',
    images: [] as string[],
    stock_quantity: '',
    sku: '',
    specifications: {},
    tags: [] as string[],
    is_featured: false,
    meta_title: '',
    meta_description: '',
  });

  useEffect(() => {
    loadProducts();
    loadCategories();
    loadAvailableImages();
  }, []);

  const loadProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select(
          `
          *,
          category:categories(*)
        `
        )
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading products:', error);
        toast.error('Erreur lors du chargement des produits');
      } else {
        setProducts(data || []);
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      toast.error('Erreur inattendue');
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name');

      if (error) {
        console.error('Error loading categories:', error);
      } else {
        setCategories(data || []);
      }
    } catch (err) {
      console.error('Unexpected error:', err);
    }
  };

  const loadAvailableImages = async () => {
    // Simuler la récupération des images du dossier public
    // En production, vous pourriez avoir une API pour lister les fichiers
    const publicImages = [
      'Hazer-co2-generated.png',
      'LiquideProHazer5L.png',
      'Logo-omega-hq-transparent.png',
    ];
    setAvailableImages(publicImages);
  };

  const calculateTTC = (priceHT: number) => {
    return priceHT * 1.2;
  };

  const calculateHT = (priceTTC: number) => {
    return priceTTC / 1.2;
  };

  const handlePriceChange = (field: 'price' | 'price_ht', value: string) => {
    const numValue = parseFloat(value) || 0;

    if (field === 'price') {
      // Si on modifie le TTC, calculer le HT
      setFormData({
        ...formData,
        price: value,
        price_ht: numValue > 0 ? calculateHT(numValue).toFixed(2) : '',
      });
    } else {
      // Si on modifie le HT, calculer le TTC
      setFormData({
        ...formData,
        price_ht: value,
        price: numValue > 0 ? calculateTTC(numValue).toFixed(2) : '',
      });
    }
  };

  const addImageToProduct = (imagePath: string) => {
    if (!formData.images.includes(imagePath)) {
      setFormData({
        ...formData,
        images: [...formData.images, imagePath],
      });
    }
    setShowImageSelector(false);
  };

  const removeImageFromProduct = (index: number) => {
    const newImages = formData.images.filter((_, i) => i !== index);
    setFormData({
      ...formData,
      images: newImages,
    });
  };

  const moveImage = (index: number, direction: 'up' | 'down') => {
    const newImages = [...formData.images];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex >= 0 && targetIndex < newImages.length) {
      [newImages[index], newImages[targetIndex]] = [
        newImages[targetIndex],
        newImages[index],
      ];
      setFormData({
        ...formData,
        images: newImages,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const productData = {
        name: formData.name,
        description: formData.description,
        long_description: formData.long_description || null,
        price: parseFloat(formData.price),
        price_ht: formData.price_ht ? parseFloat(formData.price_ht) : null,
        original_price: formData.original_price
          ? parseFloat(formData.original_price)
          : null,
        category_id: formData.category_id || null,
        image: formData.images.length > 0 ? formData.images[0] : null,
        images: formData.images.length > 0 ? formData.images : null,
        stock_quantity: parseInt(formData.stock_quantity) || 0,
        sku: formData.sku || null,
        specifications: formData.specifications,
        tags: formData.tags,
        is_featured: formData.is_featured,
        meta_title: formData.meta_title || null,
        meta_description: formData.meta_description || null,
        in_stock: parseInt(formData.stock_quantity) > 0,
      };

      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', editingProduct.id);

        if (error) {
          console.error('Error updating product:', error);
          toast.error('Erreur lors de la mise à jour');
        } else {
          toast.success('Produit mis à jour avec succès');
          resetForm();
          loadProducts();
        }
      } else {
        const { error } = await supabase.from('products').insert(productData);

        if (error) {
          console.error('Error creating product:', error);
          toast.error('Erreur lors de la création');
        } else {
          toast.success('Produit créé avec succès');
          resetForm();
          loadProducts();
        }
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      toast.error('Erreur inattendue');
    }
  };

  const deleteProduct = async (productId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce produit ?')) return;

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productId);

      if (error) {
        console.error('Error deleting product:', error);
        toast.error('Erreur lors de la suppression');
      } else {
        toast.success('Produit supprimé avec succès');
        loadProducts();
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      toast.error('Erreur inattendue');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      long_description: '',
      price: '',
      price_ht: '',
      original_price: '',
      category_id: '',
      images: [],
      stock_quantity: '',
      sku: '',
      specifications: {},
      tags: [],
      is_featured: false,
      meta_title: '',
      meta_description: '',
    });
    setEditingProduct(null);
    setShowProductModal(false);
  };

  const startEdit = (product: Product) => {
    setFormData({
      name: product.name,
      description: product.description,
      long_description: product.long_description || '',
      price: product.price.toString(),
      price_ht: product.price_ht?.toString() || '',
      original_price: product.original_price?.toString() || '',
      category_id: product.category_id || '',
      images: product.images || (product.image ? [product.image] : []),
      stock_quantity: product.stock_quantity.toString(),
      sku: product.sku || '',
      specifications: product.specifications || {},
      tags: product.tags || [],
      is_featured: product.is_featured || false,
      meta_title: product.meta_title || '',
      meta_description: product.meta_description || '',
    });
    setEditingProduct(product);
    setShowProductModal(true);
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch =
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory =
      categoryFilter === 'all' || product.category_id === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-white text-xl">Chargement des produits...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <Package className="text-green-400" size={32} />
            Gestion des Produits
          </h1>
          <p className="text-gray-400">
            Gérez votre catalogue de produits OMEGA
          </p>
        </div>
        <button
          onClick={() => setShowProductModal(true)}
          className="bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-green-500/25 transition-all duration-300 flex items-center gap-2"
        >
          <Plus size={20} />
          Nouveau Produit
        </button>
      </div>

      {/* Filtres */}
      <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={20}
            />
            <input
              type="text"
              placeholder="Rechercher un produit..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-400 focus:border-green-400 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="text-gray-400" size={20} />
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:border-green-400 focus:outline-none"
            >
              <option value="all">Toutes les catégories</option>
              {categories.map(category => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Liste des produits */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredProducts.map(product => (
          <div
            key={product.id}
            className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl overflow-hidden border border-white/10 hover:border-green-400/30 transition-all duration-300"
          >
            <div className="relative">
              <img
                src={
                  product.image
                    ? product.image.startsWith('/')
                      ? product.image
                      : `/${product.image}`
                    : product.images && product.images.length > 0
                      ? product.images[0].startsWith('/')
                        ? product.images[0]
                        : `/${product.images[0]}`
                      : 'https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg'
                }
                alt={product.name}
                className="w-full h-48 object-cover"
              />
              {product.is_featured && (
                <div className="absolute top-2 left-2 bg-yellow-500 text-black px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                  <Star size={12} />
                  Vedette
                </div>
              )}
              {!product.in_stock && (
                <div className="absolute top-2 right-2 bg-red-500 text-white px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                  <AlertCircle size={12} />
                  Rupture
                </div>
              )}
            </div>

            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="bg-green-400/20 text-green-400 px-2 py-1 rounded-full text-xs font-medium">
                  {product.category?.name || 'Sans catégorie'}
                </span>
                <div className="text-right">
                  <div className="text-green-400 font-bold">
                    {product.price.toFixed(2)}€
                  </div>
                  {product.price_ht && (
                    <div className="text-gray-400 text-xs">
                      {product.price_ht.toFixed(2)}€ HT
                    </div>
                  )}
                </div>
              </div>

              <h3 className="text-white font-bold mb-2 line-clamp-2">
                {product.name}
              </h3>
              <p className="text-gray-400 text-sm mb-3 line-clamp-2">
                {product.description}
              </p>

              <div className="flex items-center justify-between mb-4">
                <div className="text-sm">
                  <span
                    className={`font-medium ${product.stock_quantity > 0 ? 'text-green-400' : 'text-red-400'}`}
                  >
                    Stock: {product.stock_quantity}
                  </span>
                </div>
                {product.sku && (
                  <div className="text-gray-400 text-xs">
                    SKU: {product.sku}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => startEdit(product)}
                  className="flex-1 bg-blue-500/20 text-blue-400 px-3 py-2 rounded-lg hover:bg-blue-500/30 transition-colors flex items-center justify-center gap-2"
                >
                  <Edit3 size={14} />
                  Modifier
                </button>
                <button
                  onClick={() => deleteProduct(product.id)}
                  className="bg-red-500/20 text-red-400 px-3 py-2 rounded-lg hover:bg-red-500/30 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredProducts.length === 0 && (
        <div className="text-center py-12">
          <Package className="text-gray-400 mx-auto mb-4" size={48} />
          <h3 className="text-white font-semibold mb-2">
            Aucun produit trouvé
          </h3>
          <p className="text-gray-400">
            Aucun produit ne correspond à vos critères de recherche
          </p>
        </div>
      )}

      {/* Modal produit */}
      {showProductModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-white">
                {editingProduct ? 'Modifier le produit' : 'Nouveau produit'}
              </h3>
              <button
                onClick={resetForm}
                className="text-gray-400 hover:text-white transition-colors text-2xl"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Nom du produit *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-green-400 focus:outline-none"
                    placeholder="Nom du produit"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Catégorie
                  </label>
                  <select
                    value={formData.category_id}
                    onChange={e =>
                      setFormData({ ...formData, category_id: e.target.value })
                    }
                    className="w-full dark-select rounded-lg px-4 py-3 focus:border-green-400 focus:outline-none"
                  >
                    <option value="">Sélectionner une catégorie</option>
                    {categories.map(category => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Description courte *
                </label>
                <textarea
                  required
                  rows={3}
                  value={formData.description}
                  onChange={e =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-green-400 focus:outline-none resize-none"
                  placeholder="Description courte du produit"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Description détaillée
                </label>
                <textarea
                  rows={5}
                  value={formData.long_description}
                  onChange={e =>
                    setFormData({
                      ...formData,
                      long_description: e.target.value,
                    })
                  }
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-green-400 focus:outline-none resize-none"
                  placeholder="Description détaillée du produit"
                />
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Prix TTC * (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.price}
                    onChange={e => handlePriceChange('price', e.target.value)}
                    className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-green-400 focus:outline-none"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Prix HT (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.price_ht}
                    onChange={e =>
                      handlePriceChange('price_ht', e.target.value)
                    }
                    className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-green-400 focus:outline-none"
                    placeholder="0.00"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Calculé automatiquement (TTC ÷ 1.20)
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Prix original (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.original_price}
                    onChange={e =>
                      setFormData({
                        ...formData,
                        original_price: e.target.value,
                      })
                    }
                    className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-green-400 focus:outline-none"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Stock *
                  </label>
                  <input
                    type="number"
                    required
                    value={formData.stock_quantity}
                    onChange={e =>
                      setFormData({
                        ...formData,
                        stock_quantity: e.target.value,
                      })
                    }
                    className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-green-400 focus:outline-none"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    SKU
                  </label>
                  <input
                    type="text"
                    value={formData.sku}
                    onChange={e =>
                      setFormData({ ...formData, sku: e.target.value })
                    }
                    className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-green-400 focus:outline-none"
                    placeholder="SKU du produit"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Images du produit
                </label>

                {/* Images sélectionnées */}
                {formData.images.length > 0 && (
                  <div className="mb-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {formData.images.map((image, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={image.startsWith('/') ? image : `/${image}`}
                            alt={`Image ${index + 1}`}
                            className="w-full h-24 object-cover rounded-lg border border-white/20"
                          />
                          {index === 0 && (
                            <div className="absolute top-1 left-1 bg-green-500 text-white px-2 py-1 rounded text-xs font-bold">
                              Principale
                            </div>
                          )}
                          <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {index > 0 && (
                              <button
                                type="button"
                                onClick={() => moveImage(index, 'up')}
                                className="bg-blue-500 text-white p-1 rounded hover:bg-blue-600"
                                title="Monter"
                              >
                                <ChevronUp size={12} />
                              </button>
                            )}
                            {index < formData.images.length - 1 && (
                              <button
                                type="button"
                                onClick={() => moveImage(index, 'down')}
                                className="bg-blue-500 text-white p-1 rounded hover:bg-blue-600"
                                title="Descendre"
                              >
                                <ChevronDown size={12} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => removeImageFromProduct(index)}
                              className="bg-red-500 text-white p-1 rounded hover:bg-red-600"
                              title="Supprimer"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      La première image est l'image principale. Utilisez les
                      flèches pour réorganiser.
                    </p>
                  </div>
                )}

                {/* Bouton pour ajouter des images */}
                <button
                  type="button"
                  onClick={() => setShowImageSelector(true)}
                  className="w-full bg-white/5 border-2 border-dashed border-white/20 rounded-lg p-4 text-gray-400 hover:border-green-400 hover:text-green-400 transition-colors flex items-center justify-center gap-2"
                >
                  <ImageIcon size={20} />
                  Ajouter une image
                </button>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_featured"
                  checked={formData.is_featured}
                  onChange={e =>
                    setFormData({ ...formData, is_featured: e.target.checked })
                  }
                  className="w-4 h-4 text-green-400 bg-white/5 border-white/20 rounded focus:ring-green-400"
                />
                <label htmlFor="is_featured" className="text-gray-300">
                  Produit vedette
                </label>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-gradient-to-r from-green-500 to-green-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-green-500/25 transition-all duration-300"
                >
                  {editingProduct ? 'Mettre à jour' : 'Créer le produit'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-6 border-2 border-white/30 text-white rounded-lg font-semibold hover:bg-white/10 hover:border-white/50 transition-all duration-300"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal sélecteur d'images */}
      {showImageSelector && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 border border-white/10 max-w-4xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-white">
                Sélectionner une image
              </h3>
              <button
                onClick={() => setShowImageSelector(false)}
                className="text-gray-400 hover:text-white transition-colors text-2xl"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {availableImages.map((image, index) => (
                <div
                  key={index}
                  className="relative group cursor-pointer"
                  onClick={() => addImageToProduct(image)}
                >
                  <img
                    src={`/${image}`}
                    alt={image}
                    className="w-full h-32 object-cover rounded-lg border border-white/20 hover:border-green-400 transition-colors"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                    <Plus className="text-white" size={24} />
                  </div>
                  <div className="absolute bottom-2 left-2 right-2">
                    <div className="bg-black/70 text-white text-xs p-1 rounded truncate">
                      {image}
                    </div>
                  </div>
                  {formData.images.includes(image) && (
                    <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1">
                      <Eye size={12} />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {availableImages.length === 0 && (
              <div className="text-center py-12">
                <ImageIcon className="text-gray-400 mx-auto mb-4" size={48} />
                <h4 className="text-white font-semibold mb-2">
                  Aucune image disponible
                </h4>
                <p className="text-gray-400">
                  Ajoutez des images dans le dossier public/
                </p>
              </div>
            )}

            <div className="flex justify-end mt-6">
              <button
                onClick={() => setShowImageSelector(false)}
                className="px-6 py-3 border-2 border-white/30 text-white rounded-lg font-semibold hover:bg-white/10 hover:border-white/50 transition-all duration-300"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminProducts;
