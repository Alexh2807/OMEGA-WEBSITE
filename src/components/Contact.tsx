import React, { useState } from 'react';
import { Mail, Phone, MapPin, Send, CheckCircle } from 'lucide-react';

const Contact = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    budget: '',
    message: '',
  });
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate form submission
    setIsSubmitted(true);
    setTimeout(() => setIsSubmitted(false), 3000);
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
                Parlons de Votre <span className="text-yellow-400">Vision</span>
              </h3>
              <p className="text-gray-400 mb-8 leading-relaxed">
                Notre équipe d'experts est à votre disposition pour comprendre
                vos besoins et vous proposer des solutions sur mesure qui
                dépasseront vos attentes.
              </p>
            </div>

            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="bg-gradient-to-br from-yellow-400/20 to-orange-500/20 rounded-xl p-3">
                  <Mail className="text-yellow-400" size={24} />
                </div>
                <div>
                  <div className="text-white font-semibold">Email</div>
                  <div className="text-gray-400">
                    contact@premium-agency.com
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="bg-gradient-to-br from-yellow-400/20 to-orange-500/20 rounded-xl p-3">
                  <Phone className="text-yellow-400" size={24} />
                </div>
                <div>
                  <div className="text-white font-semibold">Téléphone</div>
                  <div className="text-gray-400">+33 1 23 45 67 89</div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="bg-gradient-to-br from-yellow-400/20 to-orange-500/20 rounded-xl p-3">
                  <MapPin className="text-yellow-400" size={24} />
                </div>
                <div>
                  <div className="text-white font-semibold">Adresse</div>
                  <div className="text-gray-400">
                    123 Avenue des Champs-Élysées, Paris
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
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Budget
                    </label>
                    <select
                      name="budget"
                      value={formData.budget}
                      onChange={handleChange}
                      className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white focus:border-yellow-400 focus:outline-none transition-colors"
                    >
                      <option value="">Sélectionner un budget</option>
                      <option value="5k-10k">5 000€ - 10 000€</option>
                      <option value="10k-25k">10 000€ - 25 000€</option>
                      <option value="25k-50k">25 000€ - 50 000€</option>
                      <option value="50k+">50 000€+</option>
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
                    className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-yellow-400 focus:outline-none transition-colors resize-none"
                    placeholder="Décrivez votre projet en détail..."
                  ></textarea>
                </div>

                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-yellow-400 to-orange-500 text-black py-4 rounded-lg font-semibold hover:shadow-lg hover:shadow-yellow-400/25 transition-all duration-300 flex items-center justify-center gap-2"
                >
                  <Send size={20} />
                  Envoyer le Message
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
