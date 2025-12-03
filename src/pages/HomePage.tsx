import React from 'react';
import Hero from '../components/Hero';
import HazerSection from '../components/HazerSection';
import MousseSection from '../components/MousseSection';
import ElFuegoSection from '../components/ElFuegoSection';
import About from '../components/About';
import Contact from '../components/Contact';

const HomePage = () => {
  return (
    <div className="min-h-screen">
      <Hero />
      <HazerSection />
      <MousseSection />
      <ElFuegoSection />
      <About />
      <Contact />
    </div>
  );
};

export default HomePage;
