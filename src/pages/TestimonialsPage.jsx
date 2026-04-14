import React from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Star, Clock, Activity, Map } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TestimonialCard from '@/components/TestimonialCard';
import SectionHeading from '@/components/SectionHeading';
import GradientBackground from '@/components/GradientBackground';
import StatCard from '@/components/StatCard';

const TestimonialsPage = () => {
  const testimonials = [
    {
      name: 'Dr. Rajesh Kumar',
      role: 'Chief of Emergency Medicine',
      organization: 'Apollo Hospital, Mumbai',
      quote: 'SkyMed has revolutionized how we handle critical trauma cases. The ability to transport patients from accident sites to our facility in under 15 minutes has dramatically improved survival rates.',
      impact: '40% survival increase',
      rating: 5,
      image: '👨‍⚕️'
    },
    {
      name: 'Sister Mary Joseph',
      role: 'Head Nurse',
      organization: 'Fortis Healthcare',
      quote: 'The coordination between SkyMed and our emergency team is seamless. We know exactly when the patient will arrive and their status, allowing us to prep the OR immediately.',
      impact: 'Seamless handover',
      rating: 5,
      image: '👩‍⚕️'
    },
    {
      name: 'Mr. Arjun Patel',
      role: 'Accident Survivor',
      organization: 'Patient',
      quote: 'I was in a severe highway accident. Within 12 minutes, SkyMed arrived. The doctors said those minutes saved my life. I am forever grateful.',
      impact: 'Life saved',
      rating: 5,
      image: '👨'
    },
    {
      name: 'Dr. Priya Sharma',
      role: 'Director of Critical Care',
      organization: 'Max Hospital',
      quote: 'For inter-hospital transfers of critically ill patients, SkyMed is unmatched. A 3-hour road journey took 20 minutes, allowing for life-saving surgery.',
      impact: 'Critical transfer success',
      rating: 5,
      image: '👩‍⚕️'
    },
    {
      name: 'Vikram Singh',
      role: 'Highway Patrol',
      organization: 'Traffic Police',
      quote: 'SkyMed is an invaluable partner. Their ability to reach accident sites quickly and provide advanced care is a game-changer for highway safety.',
      impact: 'Rapid response partner',
      rating: 5,
      image: '👮'
    },
    {
      name: 'Anjali Desai',
      role: 'Rural Medical Officer',
      organization: 'Community Health',
      quote: 'SkyMed has bridged the gap for our remote village. We can now get critical patients to the city in minutes, saving lives that would have been lost.',
      impact: 'Rural access provided',
      rating: 5,
      image: '👩‍⚕️'
    }
  ];

  return (
    <>
      <Helmet>
        <title>Testimonials - SkyMed | Real Stories of Lives Saved</title>
        <meta name="description" content="Read real testimonials from doctors, hospitals, emergency services, and patients about how SkyMed's eVTOL air medical services are saving lives across India." />
      </Helmet>

      {/* Hero Section */}
      <section className="relative min-h-[50vh] flex items-center justify-center overflow-hidden">
        <GradientBackground
          imageUrl="https://images.unsplash.com/photo-1675771384315-7f1f60050394"
          gradientFrom="rgba(255, 184, 0, 0.3)"
          gradientTo="rgba(15, 23, 42, 0.9)"
        />
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 font-poppins">
              Stories of Lives Saved
            </h1>
            <p className="text-xl md:text-2xl text-gray-200 max-w-3xl mx-auto font-inter">
              Real experiences from the patients we've helped and the professionals we work with
            </p>
          </motion.div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 bg-slate-900 border-b border-slate-800">
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-8">
               <h2 className="text-2xl font-bold text-white font-poppins">By The Numbers</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
               <StatCard value="12min" label="Avg Response Time" icon={Clock} delay={0} />
               <StatCard value="98%" label="Mission Success Rate" icon={Activity} delay={0.1} />
               <StatCard value="5 Cities" label="Current Coverage" icon={Map} delay={0.2} />
            </div>
         </div>
      </section>

      {/* Testimonials Grid */}
      <section className="py-20 bg-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            title="What People Are Saying"
            subtitle="Voices from the field: Patients, Doctors, and First Responders"
          />
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mt-12">
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
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-amber-600 to-orange-600 relative overflow-hidden">
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 font-poppins">
              Share Your Story or Partner With Us
            </h2>
            <p className="text-xl text-white/90 mb-10 max-w-2xl mx-auto font-inter">
              Your experience can inspire others and help us expand our life-saving network.
            </p>
            <div className="flex justify-center gap-4">
               <Link to="/contact">
               <Button className="bg-white text-orange-600 hover:bg-gray-100 font-bold px-8 py-4 text-lg rounded-xl shadow-2xl hover:shadow-3xl transform hover:scale-105 transition-all duration-300">
                  Contact Us
               </Button>
               </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  );
};

export default TestimonialsPage;