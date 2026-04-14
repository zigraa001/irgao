import React from 'react';

const GradientBackground = ({ imageUrl, gradientFrom, gradientTo }) => {
  return (
    <>
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${imageUrl})` }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to bottom, ${gradientFrom}, ${gradientTo})`
        }}
      />
    </>
  );
};

export default GradientBackground;