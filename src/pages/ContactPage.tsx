import React, { useState } from 'react';
import {
  Mail,
  Phone,
  MapPin,
  Send,
  CheckCircle,
  MessageSquare,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const ContactPage = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    subject: '',
    message: '',
    type: 'general', // general, demo, quote
  });
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Créer une demande de contact dans la base de données
      const { error } = await supabase.from('contact_requests').insert({
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        company: formData.company,
        subject: formData.subject,
        message: formData.message,
        type: formData.type,
        user_id: user?.id || null,
        status: 'pending',
      });

      if (error) {
        console.error('Error submitting contact form:', error);
        toast.error("Erreur lors de l'envoi du message");
      } else {
        setIsSubmitted(true);
        toast.success('Message envoyé avec succès !');
        setTimeout(() => setIsSubmitted(false), 5000);

        // Reset form
        setFormData({
          name: '',
          email: '',
          phone: '',
          company: '',
          subject: '',
          message: '',
          type: 'general',
        });
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      toast.error('Erreur inattendue');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24">
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto text-center mb-16">
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
            Contactez-Nous
          </h1>
          <p className="text-xl text-gray-400 leading-relaxed">
            Notre équipe d'experts est à votre disposition pour répondre à
            toutes vos questions sur nos machines OMEGA.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Contact Info */}
          <div className="space-y-8">
            <div>
              <h2 className="text-3xl font-bold text-white mb-6">
                Parlons de Votre <span className="text-yellow-400">Projet</span>
              </h2>
              <p className="text-gray-400 mb-8 leading-relaxed">
                Depuis 1996, OMEGA accompagne les professionnels de
                l'événementiel avec des solutions techniques de haute qualité.
                Contactez-nous pour découvrir nos machines et services.
              </p>
            </div>

            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="bg-gradient-to-br from-blue-500/20 to-purple-600/20 rounded-xl p-3">
                  <Phone className="text-blue-400" size={24} />
                </div>
                <div>
                  <div className="text-white font-semibold">Téléphone</div>
                  <a
                    href="tel:+33619918719"
                    className="text-gray-400 hover:text-yellow-400 transition-colors"
                  >
                    +33 6 19 91 87 19
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="bg-gradient-to-br from-blue-500/20 to-purple-600/20 rounded-xl p-3">
                  <Mail className="text-blue-400" size={24} />
                </div>
                <div>
                  <div className="text-white font-semibold">Email</div>
                  <a
                    href="mailto:contact@captivision.fr"
                    className="text-gray-400 hover:text-yellow-400 transition-colors"
                  >
                    contact@captivision.fr
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="bg-gradient-to-br from-blue-500/20 to-purple-600/20 rounded-xl p-3">
                  <MapPin className="text-blue-400" size={24} />
                </div>
                <div>
                  <div className="text-white font-semibold">Siège Social</div>
                  <div className="text-gray-400">France</div>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <MessageSquare className="text-blue-400" size={24} />
                Nos Services
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <CheckCircle className="text-green-400" size={20} />
                  <span className="text-gray-300">
                    Démonstration gratuite sur demande
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="text-green-400" size={20} />
                  <span className="text-gray-300">
                    Devis personnalisé sous 24h
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="text-green-400" size={20} />
                  <span className="text-gray-300">
                    Support technique expert
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="text-green-400" size={20} />
                  <span className="text-gray-300">
                    Garantie 10 ans sur nos machines
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-8 border border-white/10">
            {isSubmitted ? (
              <div className="text-center py-12">
                <CheckCircle
                  className="text-green-400 mx-auto mb-4"
                  size={48}
                />
                <h3 className="text-2xl font-bold text-white mb-2">
                  Message Envoyé !
                </h3>
                <p className="text-gray-400">
                  Nous vous recontacterons dans les plus brefs délais.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Type de demande
                  </label>
                  <select
                    name="type"
                    value={formData.type}
                    onChange={handleChange}
                    className="w-full dark-select rounded-lg px-4 py-3 focus:border-yellow-400 focus:outline-none transition-colors"
                  >
                    <option value="general">Demande générale</option>
                    <option value="demo">Demande de démonstration</option>
                    <option value="quote">Demande de devis</option>
                  </select>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Nom complet *
                    </label>
                    <input
                      type="text"
                      name="name"
                      required
                      value={formData.name}
                      onChange={handleChange}
                      className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-yellow-400 focus:outline-none transition-colors"
                      placeholder="Votre nom"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Email *
                    </label>
                    <input
                      type="email"
                      name="email"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-yellow-400 focus:outline-none transition-colors"
                      placeholder="votre@email.com"
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Téléphone
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-yellow-400 focus:outline-none transition-colors"
                      placeholder="Votre numéro"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Entreprise
                    </label>
                    <input
                      type="text"
                      name="company"
                      value={formData.company}
                      onChange={handleChange}
                      className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-yellow-400 focus:outline-none transition-colors"
                      placeholder="Nom de votre entreprise"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Sujet *
                  </label>
                  <input
                    type="text"
                    name="subject"
                    required
                    value={formData.subject}
                    onChange={handleChange}
                    className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-yellow-400 focus:outline-none transition-colors"
                    placeholder="Sujet de votre demande"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Message *
                  </label>
                  <textarea
                    name="message"
                    required
                    rows={6}
                    value={formData.message}
                    onChange={handleChange}
                    className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-yellow-400 focus:outline-none transition-colors resize-none"
                    placeholder="Décrivez votre projet ou votre demande en détail..."
                  ></textarea>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-4 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Send size={20} />
                  {loading ? 'Envoi en cours...' : 'Envoyer le Message'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContactPage;
