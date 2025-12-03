import React, { useState } from 'react';
import { Mail, Phone, MapPin, Send, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const Contact = () => {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    budget: '',
    subject: '',
    message: '',
  });
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const { error } = await supabase.from('contact_requests').insert({
        user_id: user?.id || null,
        name: formData.name,
        email: formData.email,
        phone: formData.phone || null,
        company: formData.company || null,
        subject: formData.subject || `Demande de contact - Budget: ${formData.budget || 'Non spécifié'}`,
        message: formData.message,
        type: 'quote',
        status: 'pending',
        read_by_user: false,
        source: 'website',
        priority: 'normal',
      });

      if (error) {
        console.error('Erreur insertion contact:', error);
        toast.error('Erreur lors de l\'envoi du message');
      } else {
        setIsSubmitted(true);
        toast.success('Message envoyé avec succès !');

        // Réinitialiser le formulaire après 3 secondes
        setTimeout(() => {
          setFormData({
            name: '',
            email: '',
            phone: '',
            company: '',
            budget: '',
            subject: '',
            message: '',
          });
          setIsSubmitted(false);
        }, 3000);
      }
    } catch (err) {
      console.error('Erreur inattendue:', err);
      toast.error('Une erreur est survenue');
    } finally {
      setIsSubmitting(false);
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
    <section id="contact" className="py-20 bg-black">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto text-center mb-16">
          <h2 className="text-5xl font-bold mb-6 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
            Démarrons Votre Projet
          </h2>
          <p className="text-xl text-gray-400 leading-relaxed">
            Prêt à transformer votre vision en réalité ? Contactez-nous pour
            discuter de votre projet premium.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Contact Info */}
          <div className="space-y-8">
            <div>
              <h3 className="text-3xl font-bold text-white mb-6">
                Parlons de Votre <span className="text-blue-400">Vision</span>
              </h3>
              <p className="text-gray-400 mb-8 leading-relaxed">
                Notre équipe d'experts est à votre disposition pour comprendre
                vos besoins et vous proposer des solutions sur mesure qui
                dépasseront vos attentes.
              </p>
            </div>

            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="bg-gradient-to-br from-blue-500/20 to-purple-600/20 rounded-xl p-3">
                  <Mail className="text-blue-400" size={24} />
                </div>
                <div>
                  <div className="text-white font-semibold">Email</div>
                  <div className="text-gray-400">
                    contact@captivision.fr
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="bg-gradient-to-br from-blue-500/20 to-purple-600/20 rounded-xl p-3">
                  <Phone className="text-blue-400" size={24} />
                </div>
                <div>
                  <div className="text-white font-semibold">Téléphone</div>
                  <div className="text-gray-400">06 19 91 87 19</div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="bg-gradient-to-br from-blue-500/20 to-purple-600/20 rounded-xl p-3">
                  <MapPin className="text-blue-400" size={24} />
                </div>
                <div>
                  <div className="text-white font-semibold">Adresse</div>
                  <div className="text-gray-400">
                    Lot Artisanal Communal, 34290 MONTBLANC
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-white/10">
              <h4 className="text-xl font-bold text-white mb-4">
                Pourquoi Nous Choisir ?
              </h4>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <CheckCircle className="text-green-400" size={20} />
                  <span className="text-gray-300">
                    Expertise technique reconnue
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="text-green-400" size={20} />
                  <span className="text-gray-300">Support client 24/7</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="text-green-400" size={20} />
                  <span className="text-gray-300">Garantie satisfaction</span>
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
                      className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none transition-colors"
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
                      className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none transition-colors"
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
                      className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none transition-colors"
                      placeholder="06 12 34 56 78"
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
                      className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none transition-colors"
                      placeholder="Nom de votre entreprise"
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Sujet
                    </label>
                    <input
                      type="text"
                      name="subject"
                      value={formData.subject}
                      onChange={handleChange}
                      className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none transition-colors"
                      placeholder="Sujet de votre demande"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Budget estimé
                    </label>
                    <select
                      name="budget"
                      value={formData.budget}
                      onChange={handleChange}
                      className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white focus:border-blue-400 focus:outline-none transition-colors"
                    >
                      <option value="">Sélectionner un budget</option>
                      <option value="1k-3k">1 000€ - 3 000€</option>
                      <option value="3k-5k">3 000€ - 5 000€</option>
                      <option value="5k-10k">5 000€ - 10 000€</option>
                      <option value="10k-20k">10 000€ - 20 000€</option>
                      <option value="20k+">20 000€+</option>
                    </select>
                  </div>
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
                    className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none transition-colors resize-none"
                    placeholder="Décrivez votre projet en détail..."
                  ></textarea>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-4 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send size={20} />
                  {isSubmitting ? 'Envoi en cours...' : 'Envoyer le Message'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Contact;
