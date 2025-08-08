import React from 'react';
import Hero from '../components/Hero';
import Services from '../components/Services';
import About from '../components/About';
import CTASection from '../components/CTASection';
import Contact from '../components/Contact';

const HomePage = () => {
  return (
    <div className="min-h-screen">
      <Hero />
      <Services />
      <About />
      <CTASection />
      <Contact />
    </div>
  );
};

export default HomePage;
