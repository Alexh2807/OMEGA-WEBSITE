import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ShoppingCart,
  Star,
  Shield,
  Award,
  Heart,
  Share2,
  Minus,
  Plus,
  Check,
  AlertCircle,
  Phone,
  Mail,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Product } from '../types';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const ProductDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const { addToCart } = useCart();
  const { user, userType } = useAuth();

  useEffect(() => {
    if (id) {
      loadProduct();
    }
  }, [id]);

  const loadProduct = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select(
          `
          *,
          category:categories(*)
        `
        )
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error loading product:', error);
        toast.error('Produit non trouvé');
        navigate('/produits');
        return;
      }

      setProduct(data);
    } catch (err) {
      console.error('Unexpected error:', err);
      toast.error('Erreur lors du chargement du produit');
      navigate('/produits');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = () => {
    if (!user) {
      toast.error('Veuillez vous connecter pour ajouter au panier');
      navigate('/connexion');
      return;
    }
    if (!product) return;

    addToCart(product, quantity);
  };

  const handleQuantityChange = (newQuantity: number) => {
    if (newQuantity >= 1 && newQuantity <= (product?.stock_quantity || 0)) {
      setQuantity(newQuantity);
    }
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24 flex items-center justify-center">
        <div className="text-white text-xl">Chargement du produit...</div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">
            Produit non trouvé
          </h2>
          <Link
            to="/produits"
            className="bg-gradient-to-r from-yellow-400 to-orange-500 text-black px-6 py-3 rounded-full font-semibold"
          >
            Retour aux produits
          </Link>
        </div>
      </div>
    );
  }

  const images =
    product.images && product.images.length > 0
      ? product.images
      : [
          product.image ||
            'https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg',
        ];
  const isInStock = product.in_stock && product.stock_quantity > 0;
  const hasDiscount =
    product.original_price && product.original_price > product.price;

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24">
      <div className="container mx-auto px-6 py-12">
        {/* Breadcrumb */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <Link to="/" className="hover:text-yellow-400 transition-colors">
              Accueil
            </Link>
            <span>/</span>
            <Link
              to="/produits"
              className="hover:text-yellow-400 transition-colors"
            >
              Produits
            </Link>
            <span>/</span>
            <Link
              to={`/produits?category=${product.category_id}`}
              className="hover:text-yellow-400 transition-colors"
            >
              {product.category?.name}
            </Link>
            <span>/</span>
            <span className="text-white">{product.name}</span>
          </div>
          <Link
            to="/produits"
            className="flex items-center gap-2 text-gray-400 hover:text-yellow-400 transition-colors w-fit mt-2"
          >
            <ArrowLeft size={20} />
            Retour aux produits
          </Link>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 mb-16">
          {/* Images Section */}
          <div>
            {/* Main Image */}
            <div className="relative mb-4">
              <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                <img
                  src={
                    images[selectedImageIndex]?.startsWith('/')
                      ? images[selectedImageIndex]
                      : `/${images[selectedImageIndex]}`
                  }
                  alt={product.name}
                  className="w-full h-96 object-contain rounded-lg"
                />
              </div>
              {hasDiscount && (
                <div className="absolute top-4 left-4 bg-red-500 text-white px-3 py-1 rounded-full font-bold text-sm">
                  -
                  {Math.round(
                    ((product.original_price! - product.price) /
                      product.original_price!) *
                      100
                  )}
                  %
                </div>
              )}
              {!isInStock && (
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                  <div className="bg-red-500 text-white px-6 py-3 rounded-full font-bold">
                    Rupture de Stock
                  </div>
                </div>
              )}
            </div>

            {/* Thumbnail Images */}
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto">
                {images.map((image, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImageIndex(index)}
                    className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-colors ${
                      selectedImageIndex === index
                        ? 'border-yellow-400'
                        : 'border-white/20'
                    }`}
                  >
                    <img
                      src={image?.startsWith('/') ? image : `/${image}`}
                      alt={`${product.name} ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Info */}
          <div>
            {/* Category Badge */}
            <div className="flex items-center gap-2 mb-4">
              <span className="bg-blue-400/20 text-blue-400 px-3 py-1 rounded-full text-sm font-medium">
                {product.category?.name}
              </span>
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className="text-blue-400 fill-current"
                    size={16}
                  />
                ))}
              </div>
            </div>

            {/* Product Name */}
            <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              {product.name}
            </h1>

            {/* SKU */}
            {product.sku && (
              <p className="text-gray-400 text-sm mb-4">
                Référence: {product.sku}
              </p>
            )}

            {/* Price */}
            <div className="mb-6">
              <div className="flex items-center gap-4">
                <div className="text-4xl font-bold text-blue-400">
                  {getDisplayPrice(product).price.toFixed(2)}€
                  <span className="text-lg text-gray-400 ml-2">
                    {getDisplayPrice(product).label}
                  </span>
                </div>
                {getDisplayPrice(product).originalPrice && (
                  <div className="text-xl text-gray-400 line-through">
                    {getDisplayPrice(product).originalPrice!.toFixed(2)}€{' '}
                    {getDisplayPrice(product).label}
                  </div>
                )}
              </div>
              <div className="text-gray-400 text-sm">
                {getDisplayPrice(product).taxInfo && (
                  <div>{getDisplayPrice(product).taxInfo}</div>
                )}
                <div>Livraison gratuite</div>
              </div>
            </div>

            {/* Description */}
            <div className="mb-6">
              <p className="text-gray-300 leading-relaxed mb-4">
                {product.description}
              </p>
              {product.long_description && (
                <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                  <h3 className="text-white font-semibold mb-2">
                    Description détaillée
                  </h3>
                  <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">
                    {product.long_description}
                  </p>
                </div>
              )}
            </div>

            {/* Specifications */}
            {product.specifications &&
              Object.keys(product.specifications).length > 0 && (
                <div className="mb-6">
                  <h3 className="text-white font-semibold mb-3">
                    Spécifications
                  </h3>
                  <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {Object.entries(product.specifications).map(
                        ([key, value]) => (
                          <div
                            key={key}
                            className="bg-white/5 rounded-lg p-3 border border-white/10"
                          >
                            <div className="text-yellow-400 font-semibold text-sm mb-1 capitalize">
                              {key.replace(/_/g, ' ')}
                            </div>
                            <div className="text-white font-medium">
                              {String(value)}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </div>
              )}

            {/* Stock Status */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                {isInStock ? (
                  <>
                    <Check className="text-green-400" size={20} />
                    <span className="text-green-400 font-semibold">
                      En stock
                    </span>
                    <span className="text-gray-400">
                      ({product.stock_quantity} disponible
                      {product.stock_quantity > 1 ? 's' : ''})
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="text-red-400" size={20} />
                    <span className="text-red-400 font-semibold">
                      Rupture de stock
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Quantity Selector */}
            {isInStock && (
              <div className="mb-6">
                <label className="block text-white font-semibold mb-2">
                  Quantité
                </label>
                <div className="flex items-center gap-3">
                  <div className="flex items-center bg-white/10 rounded-lg border border-white/20">
                    <button
                      onClick={() => handleQuantityChange(quantity - 1)}
                      disabled={quantity <= 1}
                      className="p-3 text-white hover:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="px-4 py-3 text-white font-semibold min-w-[60px] text-center">
                      {quantity}
                    </span>
                    <button
                      onClick={() => handleQuantityChange(quantity + 1)}
                      disabled={quantity >= product.stock_quantity}
                      className="p-3 text-white hover:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <span className="text-gray-400 text-sm">
                    Total:{' '}
                    {(getDisplayPrice(product).price * quantity).toFixed(2)}€{' '}
                    {getDisplayPrice(product).label}
                  </span>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <button
                onClick={handleAddToCart}
                disabled={!isInStock}
                className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-4 rounded-full font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ShoppingCart size={20} />
                {isInStock ? 'Ajouter au Panier' : 'Indisponible'}
              </button>
              <button className="border-2 border-white/30 text-white px-6 py-4 rounded-full font-semibold hover:bg-white/10 hover:border-white/50 transition-all duration-300 flex items-center justify-center gap-2">
                <Heart size={20} />
                Favoris
              </button>
              <button className="border-2 border-white/30 text-white px-6 py-4 rounded-full font-semibold hover:bg-white/10 hover:border-white/50 transition-all duration-300 flex items-center justify-center gap-2">
                <Share2 size={20} />
                Partager
              </button>
            </div>

            {/* Guarantees */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                <Award className="text-blue-400 mb-2" size={24} />
                <div className="text-white font-semibold">Garantie OMEGA</div>
                <div className="text-gray-400 text-sm">
                  Garantie constructeur incluse
                </div>
              </div>
              <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                <Shield className="text-green-400 mb-2" size={24} />
                <div className="text-white font-semibold">
                  Livraison Gratuite
                </div>
                <div className="text-gray-400 text-sm">Partout en France</div>
              </div>
            </div>

            {/* Contact for Questions */}
            <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-lg p-4 border border-blue-500/20">
              <h4 className="text-blue-400 font-semibold mb-2">
                Questions sur ce produit ?
              </h4>
              <p className="text-gray-300 text-sm mb-3">
                Notre équipe d'experts est là pour vous conseiller
              </p>
              <div className="flex gap-3">
                <Link
                  to="/contact"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
                >
                  <Mail size={16} />
                  Nous contacter
                </Link>
                <a
                  href="tel:+33619918719"
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
                >
                  <Phone size={16} />
                  Appeler
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetailPage;
