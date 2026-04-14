import React from 'react';
import { motion } from 'framer-motion';
import Card from '@/components/Card';

const StatCard = ({ value, label, icon: Icon, delay = 0 }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
    >
      <Card className="text-center h-full hover:border-amber-500/50 group">
        {Icon && (
          <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform duration-300 shadow-lg group-hover:shadow-amber-500/20">
            <Icon className="w-8 h-8 text-amber-500 group-hover:text-amber-400 transition-colors" />
          </div>
        )}
        <div className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent mb-2 font-poppins">
          {value}
        </div>
        <div className="text-gray-400 text-sm md:text-base font-inter group-hover:text-gray-300 transition-colors">
          {label}
        </div>
      </Card>
    </motion.div>
  );
};

export default StatCard;