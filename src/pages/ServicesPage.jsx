import React from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Heart, Bus as Ambulance, MapPin, Clock, Shield, AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Card from '@/components/Card';
import SectionHeading from '@/components/SectionHeading';
import GradientBackground from '@/components/GradientBackground';

const ServicesPage = () => {
  const services = [
    {
      icon: Clock,
      title: 'Emergency Response',
      description: 'Immediate deployment of our eVTOL air taxis equipped with advanced life support systems for critical medical emergencies.',
      features: [
        'Response time under 15 minutes',
        'Advanced Life Support (ALS) equipment',
        'Paramedic and EMT onboard',
        'Real-time hospital coordination'
      ],
      color: 'from-red-500 to-rose-600'
    },
    {
      icon: Heart,
      title: 'Critical Care Transport',
      description: 'Swift and safe transfer of trauma patients between healthcare facilities requiring specialized care and advanced treatment.',
      features: [
        'ICU-level care during transport',
        'Continuous vital monitoring',
        'Specialized medical team',
        'Climate-controlled cabin'
      ],
      color: 'from-amber-500 to-orange-600'
    },
    {
      icon: MapPin,
      title: 'Rural Access',
      description: 'Bridging the healthcare gap by connecting remote and rural areas to advanced medical facilities in major cities.',
      features: [
        'Remote landing capabilities',
        'Connecting villages to cities',
        'Telemedicine integration',
        'Weather-resilient operations'
      ],
      color: 'from-blue-500 to-indigo-600'
    },
    {
      icon: AlertTriangle,
      title: 'Disaster Response',
      description: 'Rapid deployment for mass casualty events, natural disasters, and areas where ground infrastructure is compromised.',
      features: [
        'Mass casualty evacuation',
        'Supply drop capabilities',
        'Search and rescue support',
        'Infrastructure-independent'
      ],
      color: 'from-purple-500 to-violet-600'
    }
  ];

  return (
    <>
      <Helmet>
        <title>Our Services - SkyMed | Emergency Air Medical Transport</title>
        <meta name="description" content="Comprehensive emergency medical air transport services including rapid response, trauma transport, rural access, and 24/7 availability. eVTOL technology saving lives." />
      </Helmet>

      {/* Hero Section */}
      <section className="relative min-h-[60vh] flex items-center justify-center overflow-hidden">
        <GradientBackground
          imageUrl="https://images.unsplash.com/photo-1657813912078-f3f08a37a809"
          gradientFrom="rgba(15, 23, 42, 0.6)"
          gradientTo="rgba(15, 23, 42, 0.9)"
        />
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 font-poppins">
              Life-Saving Services
            </h1>
            <p className="text-xl md:text-2xl text-gray-200 max-w-3xl mx-auto font-inter">
              Comprehensive emergency medical air transport solutions powered by advanced eVTOL technology
            </p>
          </motion.div>
        </div>
      </section>

      {/* Services List */}
      <section className="py-20 bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="space-y-24">
            {services.map((service, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.7 }}
                className={`flex flex-col ${index % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse'} gap-12 items-center`}
              >
                <div className="flex-1 w-full">
                  <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${service.color} flex items-center justify-center mb-6 shadow-lg`}>
                    <service.icon className="w-10 h-10 text-white" />
                  </div>
                  <h2 className="text-3xl md:text-4xl font-bold text-white mb-6 font-poppins">
                    {service.title}
                  </h2>
                  <p className="text-gray-300 text-lg mb-8 font-inter leading-relaxed">
                    {service.description}
                  </p>
                  
                  <div className="grid sm:grid-cols-2 gap-4 mb-8">
                    {service.features.map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-amber-500 flex-shrink-0 mt-1" />
                        <span className="text-gray-300 font-inter">{feature}</span>
                      </div>
                    ))}
                  </div>

                  <Link to="/contact">
                    <Button className="bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 font-semibold px-6 py-3 rounded-lg transition-all duration-300 flex items-center gap-2">
                      Request Service
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
                
                <div className="flex-1 w-full">
                  <Card className="h-full bg-slate-800/50 border-slate-700 p-8 relative overflow-hidden group">
                     <div className={`absolute top-0 right-0 w-64 h-64 bg-gradient-to-br ${service.color} opacity-10 blur-3xl rounded-full -mr-20 -mt-20 transition-opacity duration-500 group-hover:opacity-20`}></div>
                     <div className="relative z-10">
                        <h3 className="text-xl font-bold text-white mb-6">Service Capabilities</h3>
                        <ul className="space-y-4">
                           <li className="flex justify-between items-center border-b border-slate-700 pb-3">
                              <span className="text-gray-400">Response Speed</span>
                              <span className="text-amber-400 font-bold">150 mph</span>
                           </li>
                           <li className="flex justify-between items-center border-b border-slate-700 pb-3">
                              <span className="text-gray-400">Range</span>
                              <span className="text-white font-bold">100+ miles</span>
                           </li>
                           <li className="flex justify-between items-center border-b border-slate-700 pb-3">
                              <span className="text-gray-400">Availability</span>
                              <span className="text-white font-bold">24/7/365</span>
                           </li>
                           <li className="flex justify-between items-center pt-2">
                              <span className="text-gray-400">Crew</span>
                              <span className="text-white font-bold">Pilot + 2 Medics</span>
                           </li>
                        </ul>
                     </div>
                  </Card>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-20 bg-gradient-to-b from-slate-900 to-slate-800">
         <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeading 
               title="Air vs. Ground" 
               subtitle="Why eVTOL air medical transport is the superior choice for critical emergencies"
            />
            
            <div className="overflow-x-auto mt-12">
               <table className="w-full text-left border-collapse">
                  <thead>
                     <tr>
                        <th className="p-4 border-b border-slate-700 text-gray-400 font-medium">Feature</th>
                        <th className="p-4 border-b border-slate-700 text-white font-bold text-lg bg-slate-800/50 rounded-t-lg">SkyMed Air Response</th>
                        <th className="p-4 border-b border-slate-700 text-gray-400 font-medium">Traditional Ground Ambulance</th>
                     </tr>
                  </thead>
                  <tbody className="text-gray-300">
                     <tr className="border-b border-slate-700/50 hover:bg-slate-800/30 transition-colors">
                        <td className="p-4 font-medium text-white">Average Speed</td>
                        <td className="p-4 bg-slate-800/30 text-amber-400 font-bold">150 mph</td>
                        <td className="p-4">30-60 mph</td>
                     </tr>
                     <tr className="border-b border-slate-700/50 hover:bg-slate-800/30 transition-colors">
                        <td className="p-4 font-medium text-white">Traffic Impact</td>
                        <td className="p-4 bg-slate-800/30 text-green-400 font-bold">Zero</td>
                        <td className="p-4">High Risk</td>
                     </tr>
                     <tr className="border-b border-slate-700/50 hover:bg-slate-800/30 transition-colors">
                        <td className="p-4 font-medium text-white">Rural Accessibility</td>
                        <td className="p-4 bg-slate-800/30 text-white">Excellent (Direct)</td>
                        <td className="p-4">Poor (Road Dependent)</td>
                     </tr>
                     <tr className="hover:bg-slate-800/30 transition-colors">
                        <td className="p-4 font-medium text-white">Ride Quality</td>
                        <td className="p-4 bg-slate-800/30 text-white rounded-b-lg">Smooth (Air)</td>
                        <td className="p-4">Bumpy (Road Conditions)</td>
                     </tr>
                  </tbody>
               </table>
            </div>
         </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gradient-to-r from-amber-600 to-orange-600 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20" />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 font-poppins">
              Ready to Save Lives?
            </h2>
            <p className="text-xl text-white/90 mb-10 max-w-2xl mx-auto font-inter">
              Contact us today to learn more about our services or to request emergency medical transport.
            </p>
            <Link to="/contact">
              <Button className="bg-white text-orange-600 hover:bg-gray-100 font-bold px-10 py-5 text-lg rounded-xl shadow-2xl hover:shadow-3xl transform hover:scale-105 transition-all duration-300">
                Get Started Now
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>
    </>
  );
};

export default ServicesPage;