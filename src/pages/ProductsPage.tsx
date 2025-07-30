import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  Filter,
  ShoppingCart,
  Star,
  Package,
  Grid,
  List,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Product, Category } from '../types';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const ProductsPage = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const { addToCart } = useCart();
  const { user, userType } = useAuth();

  useEffect(() => {
    loadProducts();
    loadCategories();
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

  const handleAddToCart = (product: Product) => {
    if (!user) {
      toast.error('Veuillez vous connecter pour ajouter au panier');
      return;
    }
    addToCart(product);
  };

  const getDisplayPrice = (product: Product) => {
    if (userType === 'pro' && product.price_ht) {
      return {
        price: product.price_ht,
        originalPrice: product.original_price
          ? product.original_price / 1.2
          : null,
        label: 'HT',
        taxInfo: `${product.price.toFixed(2)}€ TTC`,
      };
    }
    return {
      price: product.price,
      originalPrice: product.original_price,
      label: 'TTC',
      taxInfo: product.price_ht ? `${product.price_ht.toFixed(2)}€ HT` : null,
    };
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch =
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory =
      selectedCategory === 'all' || product.category_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    switch (sortBy) {
      case 'price_asc':
        return a.price - b.price;
      case 'price_desc':
        return b.price - a.price;
      case 'name':
        return a.name.localeCompare(b.name);
      default:
        return 0;
    }
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24 flex items-center justify-center">
        <div className="text-white text-xl">Chargement des produits...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24">
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto text-center mb-16">
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
            Nos Produits OMEGA
          </h1>
          <p className="text-xl text-gray-400 leading-relaxed">
            Découvrez notre gamme complète de machines à fumée et produits
            professionnels.
          </p>
          <div className="mt-4 text-gray-400">
            Affichage:{' '}
            {userType === 'pro'
              ? 'Prix HT (Professionnel)'
              : 'Prix TTC (Particulier)'}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10 mb-8">
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
                className="w-full bg-white/10 border border-white/20 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="text-gray-400" size={20} />
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="dark-select rounded-lg px-4 py-3 focus:border-blue-400 focus:outline-none"
              >
                <option value="all">Toutes les catégories</option>
                {categories.map(category => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="dark-select rounded-lg px-4 py-3 focus:border-blue-400 focus:outline-none"
              >
                <option value="name">Nom A-Z</option>
                <option value="price_asc">Prix croissant</option>
                <option value="price_desc">Prix décroissant</option>
              </select>
              <div className="flex bg-white/10 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded ${viewMode === 'grid' ? 'bg-blue-500 text-white' : 'text-gray-400'}`}
                >
                  <Grid size={20} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded ${viewMode === 'list' ? 'bg-blue-500 text-white' : 'text-gray-400'}`}
                >
                  <List size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Products Grid */}
        {viewMode === 'grid' ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {sortedProducts.map(product => {
              const displayPrice = getDisplayPrice(product);
              const hasDiscount =
                displayPrice.originalPrice &&
                displayPrice.originalPrice > displayPrice.price;

              return (
                <div
                  key={product.id}
                  className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl overflow-hidden border border-white/10 hover:border-blue-400/30 transition-all duration-300 group"
                >
                  <div className="relative">
                    <Link to={`/produit/${product.id}`}>
                      <img
                        src={
                          product.image
                            ? product.image.startsWith('/')
                              ? product.image
                              : `/${product.image}`
                            : 'https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg'
                        }
                        alt={product.name}
                        className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </Link>
                    {hasDiscount && (
                      <div className="absolute top-2 left-2 bg-red-500 text-white px-2 py-1 rounded-full text-xs font-bold">
                        -
                        {Math.round(
                          ((displayPrice.originalPrice! - displayPrice.price) /
                            displayPrice.originalPrice!) *
                            100
                        )}
                        %
                      </div>
                    )}
                    {!product.in_stock && (
                      <div className="absolute top-2 right-2 bg-red-500 text-white px-2 py-1 rounded-full text-xs font-bold">
                        Rupture
                      </div>
                    )}
                  </div>

                  <div className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="bg-blue-400/20 text-blue-400 px-2 py-1 rounded-full text-xs font-medium">
                        {product.category?.name || 'Produit'}
                      </span>
                      <div className="flex items-center gap-1">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className="text-blue-400 fill-current"
                            size={12}
                          />
                        ))}
                      </div>
                    </div>

                    <Link to={`/produit/${product.id}`}>
                      <h3 className="text-white font-bold mb-2 hover:text-blue-400 transition-colors line-clamp-2">
                        {product.name}
                      </h3>
                    </Link>

                    <p className="text-gray-400 text-sm mb-4 line-clamp-2">
                      {product.description}
                    </p>

                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-blue-400 font-bold text-lg">
                            {displayPrice.price.toFixed(2)}€
                          </span>
                          <span className="text-gray-400 text-sm">
                            {displayPrice.label}
                          </span>
                        </div>
                        {displayPrice.originalPrice && (
                          <div className="text-gray-400 text-sm line-through">
                            {displayPrice.originalPrice.toFixed(2)}€{' '}
                            {displayPrice.label}
                          </div>
                        )}
                        {displayPrice.taxInfo && (
                          <div className="text-gray-400 text-xs">
                            {displayPrice.taxInfo}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div
                          className={`text-sm font-medium ${product.stock_quantity > 0 ? 'text-green-400' : 'text-red-400'}`}
                        >
                          {product.stock_quantity > 0 ? 'En stock' : 'Rupture'}
                        </div>
                        <div className="text-gray-400 text-xs">
                          {product.stock_quantity} disponible
                          {product.stock_quantity > 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Link
                        to={`/produit/${product.id}`}
                        className="flex-1 bg-blue-500/20 text-blue-400 px-4 py-2 rounded-lg hover:bg-blue-500/30 transition-colors text-center"
                      >
                        Voir
                      </Link>
                      <button
                        onClick={() => handleAddToCart(product)}
                        disabled={!product.in_stock}
                        className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-4 py-2 rounded-lg hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ShoppingCart size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List View */
          <div className="space-y-4">
            {sortedProducts.map(product => {
              const displayPrice = getDisplayPrice(product);
              const hasDiscount =
                displayPrice.originalPrice &&
                displayPrice.originalPrice > displayPrice.price;

              return (
                <div
                  key={product.id}
                  className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10 hover:border-blue-400/30 transition-all duration-300"
                >
                  <div className="flex items-center gap-6">
                    <Link
                      to={`/produit/${product.id}`}
                      className="flex-shrink-0"
                    >
                      <img
                        src={
                          product.image
                            ? product.image.startsWith('/')
                              ? product.image
                              : `/${product.image}`
                            : 'https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg'
                        }
                        alt={product.name}
                        className="w-24 h-24 object-cover rounded-lg"
                      />
                    </Link>

                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="bg-blue-400/20 text-blue-400 px-2 py-1 rounded-full text-xs font-medium">
                          {product.category?.name || 'Produit'}
                        </span>
                        {hasDiscount && (
                          <span className="bg-red-500 text-white px-2 py-1 rounded-full text-xs font-bold">
                            -
                            {Math.round(
                              ((displayPrice.originalPrice! -
                                displayPrice.price) /
                                displayPrice.originalPrice!) *
                                100
                            )}
                            %
                          </span>
                        )}
                      </div>

                      <Link to={`/produit/${product.id}`}>
                        <h3 className="text-xl font-bold text-white mb-2 hover:text-blue-400 transition-colors">
                          {product.name}
                        </h3>
                      </Link>

                      <p className="text-gray-400 mb-3">
                        {product.description}
                      </p>

                      <div className="flex items-center gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-blue-400 font-bold text-xl">
                              {displayPrice.price.toFixed(2)}€
                            </span>
                            <span className="text-gray-400">
                              {displayPrice.label}
                            </span>
                          </div>
                          {displayPrice.originalPrice && (
                            <div className="text-gray-400 line-through">
                              {displayPrice.originalPrice.toFixed(2)}€{' '}
                              {displayPrice.label}
                            </div>
                          )}
                          {displayPrice.taxInfo && (
                            <div className="text-gray-400 text-sm">
                              {displayPrice.taxInfo}
                            </div>
                          )}
                        </div>

                        <div
                          className={`text-sm font-medium ${product.stock_quantity > 0 ? 'text-green-400' : 'text-red-400'}`}
                        >
                          {product.stock_quantity > 0
                            ? `En stock (${product.stock_quantity})`
                            : 'Rupture de stock'}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Link
                        to={`/produit/${product.id}`}
                        className="bg-blue-500/20 text-blue-400 px-6 py-2 rounded-lg hover:bg-blue-500/30 transition-colors text-center"
                      >
                        Voir le produit
                      </Link>
                      <button
                        onClick={() => handleAddToCart(product)}
                        disabled={!product.in_stock}
                        className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-2 rounded-lg hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        <ShoppingCart size={16} />
                        Ajouter
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {sortedProducts.length === 0 && (
          <div className="text-center py-12">
            <Package className="text-gray-400 mx-auto mb-4" size={64} />
            <h3 className="text-2xl font-bold text-white mb-2">
              Aucun produit trouvé
            </h3>
            <p className="text-gray-400">
              Aucun produit ne correspond à vos critères de recherche
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductsPage;
