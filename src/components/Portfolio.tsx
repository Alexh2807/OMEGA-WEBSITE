import React, { useState } from 'react';
import { ExternalLink, Github, ArrowRight } from 'lucide-react';

const Portfolio = () => {
  const [activeCategory, setActiveCategory] = useState('Tous');

  const categories = ['Tous', 'Web Design', 'E-commerce', 'Mobile', 'Branding'];

  const projects = [
    {
      id: 1,
      title: 'Luxury Hotel Chain',
      category: 'Web Design',
      image:
        'https://images.pexels.com/photos/271639/pexels-photo-271639.jpeg?auto=compress&cs=tinysrgb&w=500',
      description:
        "Site web premium pour une chaîne d'hôtels de luxe avec système de réservation intégré",
      tech: ['React', 'Node.js', 'MongoDB'],
    },
    {
      id: 2,
      title: 'Fashion E-commerce',
      category: 'E-commerce',
      image:
        'https://images.pexels.com/photos/230544/pexels-photo-230544.jpeg?auto=compress&cs=tinysrgb&w=500',
      description:
        'Plateforme e-commerce haute couture avec expérience shopping immersive',
      tech: ['Vue.js', 'Shopify', 'Stripe'],
    },
    {
      id: 3,
      title: 'FinTech Mobile App',
      category: 'Mobile',
      image:
        'https://images.pexels.com/photos/590020/pexels-photo-590020.jpeg?auto=compress&cs=tinysrgb&w=500',
      description: 'Application mobile de gestion financière avec IA intégrée',
      tech: ['React Native', 'TensorFlow', 'Firebase'],
    },
    {
      id: 4,
      title: 'Tech Startup Brand',
      category: 'Branding',
      image:
        'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=500',
      description:
        'Identité visuelle complète pour une startup technologique innovante',
      tech: ['Illustrator', 'Figma', 'Brand Guidelines'],
    },
    {
      id: 5,
      title: 'Restaurant Chain',
      category: 'Web Design',
      image:
        'https://images.pexels.com/photos/260922/pexels-photo-260922.jpeg?auto=compress&cs=tinysrgb&w=500',
      description: 'Site web gastronomique avec système de commande en ligne',
      tech: ['Next.js', 'Sanity', 'Vercel'],
    },
    {
      id: 6,
      title: 'Luxury Watches',
      category: 'E-commerce',
      image:
        'https://images.pexels.com/photos/190819/pexels-photo-190819.jpeg?auto=compress&cs=tinysrgb&w=500',
      description: 'Boutique en ligne haut de gamme pour montres de luxe',
      tech: ['Shopify Plus', 'Custom Theme', '3D Viewer'],
    },
  ];

  const filteredProjects =
    activeCategory === 'Tous'
      ? projects
      : projects.filter(project => project.category === activeCategory);

  return (
    <section
      id="portfolio"
      className="py-20 bg-gradient-to-b from-black to-gray-900"
    >
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto text-center mb-16">
          <h2 className="text-5xl font-bold mb-6 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
            Portfolio Premium
          </h2>
          <p className="text-xl text-gray-400 leading-relaxed">
            Découvrez nos réalisations les plus prestigieuses et laissez-vous
            inspirer par notre savoir-faire exceptionnel.
          </p>
        </div>

        {/* Category Filter */}
        <div className="flex flex-wrap justify-center gap-4 mb-12">
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`px-6 py-3 rounded-full transition-all duration-300 ${
                activeCategory === category
                  ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-black font-semibold'
                  : 'bg-white/10 text-gray-300 hover:bg-white/20'
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Projects Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredProjects.map(project => (
            <div
              key={project.id}
              className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md border border-white/10 hover:border-yellow-400/30 transition-all duration-500"
            >
              <div className="relative overflow-hidden">
                <img
                  src={project.image}
                  alt={project.title}
                  className="w-full h-48 object-cover group-hover:scale-110 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <button className="bg-white/20 backdrop-blur-md rounded-full p-2 hover:bg-white/30 transition-colors">
                    <ExternalLink size={16} className="text-white" />
                  </button>
                  <button className="bg-white/20 backdrop-blur-md rounded-full p-2 hover:bg-white/30 transition-colors">
                    <Github size={16} className="text-white" />
                  </button>
                </div>
              </div>

              <div className="p-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="bg-yellow-400/20 text-yellow-400 px-3 py-1 rounded-full text-xs font-medium">
                    {project.category}
                  </span>
                </div>

                <h3 className="text-xl font-bold text-white mb-3">
                  {project.title}
                </h3>
                <p className="text-gray-400 text-sm mb-4 leading-relaxed">
                  {project.description}
                </p>

                <div className="flex flex-wrap gap-2 mb-4">
                  {project.tech.map((tech, idx) => (
                    <span
                      key={idx}
                      className="bg-white/10 text-gray-300 px-2 py-1 rounded text-xs"
                    >
                      {tech}
                    </span>
                  ))}
                </div>

                <button className="flex items-center gap-2 text-yellow-400 hover:text-yellow-300 transition-colors group/btn">
                  <span className="text-sm font-medium">Voir le projet</span>
                  <ArrowRight
                    size={16}
                    className="group-hover/btn:translate-x-1 transition-transform"
                  />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Portfolio;
