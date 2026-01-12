import React from 'react';

const PlaceholderPage = ({ title = "Page En Construction" }) => {
    return (
        <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <h1 className="text-3xl font-bold mb-4 text-white">{title}</h1>
            <p>Cette fonctionnalité est en cours de développement.</p>
        </div>
    );
};

export default PlaceholderPage;
