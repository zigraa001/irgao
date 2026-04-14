import React from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Clock, Heart, MapPin, ArrowRight, ShieldCheck, Zap, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Card from '@/components/Card';
import SectionHeading from '@/components/SectionHeading';
import GradientBackground from '@/components/GradientBackground';
import StatCard from '@/components/StatCard';
import TestimonialCard from '@/components/TestimonialCard';

const HomePage = () => {
  const stats = [
    { value: '<15 min', label: 'Average Response Time', icon: Zap },
    { value: '40%', label: 'Reduction in Mortality', icon: Activity },
    { value: '24/7', label: 'Emergency Coverage', icon: Clock },
  ];

  const services = [
    {
      icon: Zap,
      title: 'Emergency Response',
      description: 'Rapid deployment for critical medical emergencies with advanced life support equipment.',
      color: 'from-red-500 to-orange-600'
    },
    {
      icon: Heart,
      title: 'Critical Care Transport',
      description: 'Swift inter-hospital transfers for trauma patients requiring specialized ICU-level care.',
      color: 'from-amber-500 to-yellow-600'
    },
    {
      icon: MapPin,
      title: 'Rural Access',
      description: 'Bridging healthcare gaps by connecting remote areas to advanced medical facilities.',
      color: 'from-blue-500 to-indigo-600'
    }
  ];

  const testimonials = [
    {
      name: 'Dr. Rajesh Kumar',
      role: 'Chief of Emergency Medicine',
      organization: 'Apollo Hospital',
      quote: 'SkyMed has revolutionized how we handle critical trauma cases. The ability to transport patients from accident sites to our facility in under 15 minutes has dramatically improved survival rates.',
      impact: 'Trauma survival up 40%',
      rating: 5,
      image: '👨‍⚕️'
    },
    {
      name: 'Mr. Arjun Patel',
      role: 'Road Accident Survivor',
      organization: 'Patient',
      quote: 'Within 12 minutes, SkyMed arrived and transported me to a trauma center. The doctors said those minutes saved my life. The crew was professional, compassionate, and skilled.',
      impact: 'Life saved',
      rating: 5,
      image: '👨'
    }
  ];

  return (
    <>
      <Helmet>
        <title>SkyMed - Save Lives in the Golden Hour | Emergency Air Medical Services</title>
        <meta name="description" content="Revolutionary eVTOL air taxi emergency medical services. Rapid response in under 15 minutes. Saving lives during the critical golden hour across India." />
      </Helmet>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <GradientBackground
          imageUrl="https://images.unsplash.com/photo-1692967489040-07cdf6a859b9"
          gradientFrom="rgba(255, 184, 0, 0.2)"
          gradientTo="rgba(15, 23, 42, 0.9)"
        />
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <motion.div
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               transition={{ duration: 0.6, delay: 0.1 }}
               className="inline-block mb-4 px-4 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-400 text-sm font-semibold tracking-wide uppercase"
            >
              Minutes Matter. Lives Matter.
            </motion.div>
            
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="text-5xl md:text-7xl lg:text-8xl font-bold text-white mb-8 font-poppins leading-tight tracking-tight"
            >
              Save Lives in the
              <span className="block bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 bg-clip-text text-transparent">
                Golden Hour
              </span>
            </motion.h1>
            
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="text-xl md:text-2xl text-gray-300 mb-12 max-w-3xl mx-auto font-inter leading-relaxed"
            >
              Revolutionary eVTOL air taxi emergency medical services delivering rapid response when every second counts.
            </motion.p>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="flex flex-col sm:flex-row gap-6 justify-center"
            >
              <Link to="/contact">
                <Button className="w-full sm:w-auto bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white font-bold px-8 py-6 text-lg rounded-xl shadow-lg hover:shadow-red-500/30 transform hover:scale-105 transition-all duration-300 flex items-center justify-center gap-2">
                  Request Service
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
              <Link to="/services">
                <Button className="w-full sm:w-auto bg-white/10 backdrop-blur-md hover:bg-white/20 text-white font-bold px-8 py-6 text-lg rounded-xl border border-white/20 shadow-lg hover:shadow-white/10 transform hover:scale-105 transition-all duration-300">
                  Learn More
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Why Golden Hour Matters (Stats) */}
      <section className="py-20 bg-slate-900 relative">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading 
            title="Why The Golden Hour Matters" 
            subtitle="The first hour after a traumatic injury is critical. Immediate medical attention significantly increases survival chances."
          />
          <div className="grid md:grid-cols-3 gap-8 mt-12">
            {stats.map((stat, index) => (
              <StatCard 
                key={index} 
                value={stat.value} 
                label={stat.label} 
                icon={stat.icon} 
                delay={index * 0.1} 
              />
            ))}
          </div>
        </div>
      </section>

      {/* Our Services Overview */}
      <section className="py-20 bg-gradient-to-b from-slate-900 to-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            title="Our Services"
            subtitle="Comprehensive emergency medical solutions powered by cutting-edge eVTOL technology"
          />
          
          <div className="grid md:grid-cols-3 gap-8 mt-12">
            {services.map((service, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Card className="h-full group cursor-pointer border-t-4 border-t-transparent hover:border-t-amber-500 transition-all duration-300">
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${service.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-lg`}>
                    <service.icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-4 font-poppins group-hover:text-amber-400 transition-colors">
                    {service.title}
                  </h3>
                  <p className="text-gray-400 font-inter leading-relaxed group-hover:text-gray-300 transition-colors">
                    {service.description}
                  </p>
                </Card>
              </motion.div>
            ))}
          </div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="text-center mt-12"
          >
            <Link to="/services">
              <Button className="bg-transparent border border-amber-500/50 text-amber-500 hover:bg-amber-500/10 font-semibold px-8 py-3 text-lg rounded-full transition-all duration-300 flex items-center gap-2 mx-auto">
                View All Services
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Impact Stories Preview */}
      <section className="py-20 bg-slate-800 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-slate-600 to-transparent"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            title="Real Impact"
            subtitle="Stories from patients and doctors who trust SkyMed"
          />
          
          <div className="grid md:grid-cols-2 gap-8 mt-12 max-w-5xl mx-auto">
            {testimonials.map((testimonial, index) => (
               <motion.div
                 key={index}
                 initial={{ opacity: 0, y: 30 }}
                 whileInView={{ opacity: 1, y: 0 }}
                 viewport={{ once: true }}
                 transition={{ duration: 0.5, delay: index * 0.1 }}
               >
                 <TestimonialCard testimonial={testimonial} />
               </motion.div>
            ))}
          </div>

          <div className="text-center mt-10">
             <Link to="/testimonials" className="text-amber-500 hover:text-amber-400 font-medium underline underline-offset-4 decoration-amber-500/30 hover:decoration-amber-500 transition-all">
                Read more success stories
             </Link>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-24 bg-gradient-to-br from-slate-900 to-slate-950 relative overflow-hidden">
         {/* Background glow effects */}
         <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-96 h-96 bg-amber-600/10 rounded-full blur-3xl"></div>
         <div className="absolute top-1/2 right-1/4 -translate-y-1/2 w-96 h-96 bg-orange-600/10 rounded-full blur-3xl"></div>

        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl md:text-6xl font-bold text-white mb-6 font-poppins">
              Ready to Save Lives?
            </h2>
            <p className="text-xl text-gray-300 mb-10 max-w-2xl mx-auto font-inter">
              Join us in revolutionizing emergency medical response. Whether you need service or want to partner with us, we're here.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/contact">
                <Button className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold px-10 py-5 text-lg rounded-xl shadow-xl hover:shadow-orange-500/20 transform hover:scale-105 transition-all duration-300">
                  Contact Us Today
                </Button>
              </Link>
              <Link to="/services">
                 <Button className="bg-slate-800 hover:bg-slate-700 text-white font-semibold px-10 py-5 text-lg rounded-xl border border-slate-700 hover:border-slate-600 transition-all duration-300">
                    Explore Services
                 </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  );
};

export default HomePage;