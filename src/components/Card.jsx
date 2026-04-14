import React from 'react';
import { motion } from 'framer-motion';

const Card = ({ children, className = '' }) => {
  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -5 }}
      transition={{ duration: 0.3 }}
      className={`bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 shadow-lg hover:shadow-2xl hover:border-amber-500/30 transition-all duration-300 ${className}`}
    >
      {children}
    </motion.div>
  );
};

export default Card;