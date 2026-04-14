import React from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Target, Eye, Heart, Users, TrendingUp, Award, Zap, CheckCircle, ShieldCheck as ShieldCheckIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Card from '@/components/Card';
import SectionHeading from '@/components/SectionHeading';
import GradientBackground from '@/components/GradientBackground';
import StatCard from '@/components/StatCard';

const AboutPage = () => {
  const values = [
    {
      icon: Zap,
      title: 'Speed',
      description: 'We believe speed saves lives. Every second we shave off response times is a victory for patient outcomes.'
    },
    {
      icon: ShieldCheckIcon,
      title: 'Trust',
      description: 'We build trust through safety, transparency, and clinical excellence in every mission we undertake.'
    },
    {
      icon: TrendingUp,
      title: 'Innovation',
      description: 'We leverage cutting-edge eVTOL technology to solve age-old logistics problems in emergency medicine.'
    },
    {
      icon: Heart,
      title: 'Compassion',
      description: 'Medical care is about people. We treat every patient with the dignity, care, and kindness they deserve.'
    }
  ];

  const milestones = [
    { year: '2023', title: 'Founded', description: 'SkyMed established with a vision to solve the "Golden Hour" crisis.' },
    { year: '2024', title: 'First Prototype', description: 'Successful testing of our medical eVTOL configuration.' },
    { year: '2025', title: 'Service Launch', description: 'First live operations began in Mumbai metropolitan region.' },
    { year: '2026', title: 'Regional Expansion', description: 'Expanding fleet to cover 5 major Indian cities.' }
  ];

  return (
    <>
      <Helmet>
        <title>About SkyMed - Our Mission to Save Lives | Emergency Air Medical Services</title>
        <meta name="description" content="Learn about SkyMed's mission to revolutionize emergency medical response through eVTOL air taxi technology. Our vision, values, and impact on saving lives." />
      </Helmet>

      {/* Hero Section */}
      <section className="relative min-h-[50vh] flex items-center justify-center overflow-hidden">
        <GradientBackground
          imageUrl="https://images.unsplash.com/photo-1623693663568-4f55f386b350"
          gradientFrom="rgba(255, 107, 53, 0.5)"
          gradientTo="rgba(15, 23, 42, 0.9)"
        />
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 font-poppins">
              About SkyMed
            </h1>
            <p className="text-xl md:text-2xl text-gray-200 max-w-3xl mx-auto font-inter">
              Pioneering the future of emergency medical response through innovative air mobility
            </p>
          </motion.div>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="py-20 bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-16 items-start">
             {/* Mission */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center shadow-lg">
                  <Target className="w-7 h-7 text-white" />
                </div>
                <h2 className="text-3xl md:text-4xl font-bold text-white font-poppins">Our Mission</h2>
              </div>
              <h3 className="text-xl text-amber-500 font-medium mb-4">Addressing the Crisis</h3>
              <p className="text-lg text-gray-300 leading-relaxed font-inter mb-6">
                India faces a critical challenge: over 150,000 lives are lost annually on roads, largely due to delayed medical intervention. Traffic congestion and remote geography often make the "Golden Hour" impossible to achieve by road.
              </p>
              <p className="text-lg text-gray-300 leading-relaxed font-inter border-l-4 border-amber-500 pl-4">
                Our mission is to democratize rapid emergency response, ensuring that critical medical care reaches those who need it most within minutes, not hours.
              </p>
            </motion.div>
            
            {/* Vision */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
                  <Eye className="w-7 h-7 text-white" />
                </div>
                <h2 className="text-3xl md:text-4xl font-bold text-white font-poppins">Our Vision</h2>
              </div>
              <h3 className="text-xl text-blue-400 font-medium mb-4">The Future of EMS</h3>
              <p className="text-lg text-gray-300 leading-relaxed font-inter mb-6">
                We envision a healthcare ecosystem where response times are measured in minutes, regardless of location. A future where advanced life support descends from the sky to save a life on a congested highway or a remote village.
              </p>
              <p className="text-lg text-gray-300 leading-relaxed font-inter">
                By integrating eVTOL technology with world-class medical expertise, we are building the world's most responsive emergency medical network.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Core Values */}
      <section className="py-20 bg-gradient-to-b from-slate-900 to-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            title="Our Core Values"
            subtitle="The principles that guide every flight and every patient interaction"
          />
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mt-12">
            {values.map((value, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Card className="text-center h-full hover:border-amber-500/50 transition-colors">
                  <div className="w-16 h-16 rounded-full bg-slate-700/50 flex items-center justify-center mb-6 mx-auto">
                    <value.icon className="w-8 h-8 text-amber-500" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3 font-poppins">
                    {value.title}
                  </h3>
                  <p className="text-gray-400 font-inter text-sm leading-relaxed">
                    {value.description}
                  </p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Impact Stats */}
      <section className="py-20 bg-slate-900 relative">
        <div className="absolute inset-0 bg-amber-500/5 opacity-50 skew-y-3 transform origin-top-left scale-110"></div>
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
           <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              <StatCard value="500+" label="Lives Saved" icon={Heart} delay={0} />
              <StatCard value="<15m" label="Avg Response" icon={Zap} delay={0.1} />
              <StatCard value="50+" label="Partner Hospitals" icon={Users} delay={0.2} />
              <StatCard value="10k+" label="Sq Km Covered" icon={Target} delay={0.3} />
           </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="py-20 bg-slate-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading title="Our Journey" />
          
          <div className="relative mt-12">
            {/* Vertical Line */}
            <div className="absolute left-4 md:left-1/2 top-0 bottom-0 w-0.5 bg-slate-600 transform md:-translate-x-1/2"></div>
            
            <div className="space-y-12">
              {milestones.map((item, index) => (
                <motion.div 
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className={`relative flex items-center md:justify-between ${index % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'}`}
                >
                  <div className="hidden md:block w-5/12"></div>
                  
                  {/* Dot */}
                  <div className="absolute left-4 md:left-1/2 w-4 h-4 bg-amber-500 rounded-full border-4 border-slate-800 transform -translate-x-2 md:-translate-x-1/2 z-10"></div>
                  
                  <div className="ml-12 md:ml-0 w-full md:w-5/12 pl-4 md:pl-0">
                    <div className={`bg-slate-700/50 p-6 rounded-xl border border-slate-600 ${index % 2 === 0 ? 'text-left' : 'text-left md:text-right'}`}>
                      <span className="text-amber-500 font-bold text-lg block mb-1">{item.year}</span>
                      <h3 className="text-xl font-bold text-white mb-2">{item.title}</h3>
                      <p className="text-gray-300 text-sm">{item.description}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gradient-to-r from-red-600 to-orange-600 relative overflow-hidden">
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 font-poppins">
              Join Our Mission
            </h2>
            <p className="text-xl text-white/90 mb-10 max-w-2xl mx-auto font-inter">
              Whether you are a healthcare provider, investor, or talented individual, help us save lives.
            </p>
            <Link to="/contact">
              <Button className="bg-white text-orange-600 hover:bg-gray-100 font-bold px-10 py-5 text-lg rounded-xl shadow-2xl hover:shadow-3xl transform hover:scale-105 transition-all duration-300">
                Contact Us Today
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>
    </>
  );
};

export default AboutPage;