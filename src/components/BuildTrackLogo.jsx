import React from 'react';

const BuildTrackLogo = ({ size = 160, bgColor = '#020617' }) => {
    const iconSize = size * 0.6;
    const fontSize = size * 0.18;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: size * 0.04 }}>
            {/* B Icon */}
            <svg width={iconSize} height={iconSize} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="bl-grad" x1="0" y1="0" x2="0" y2="200" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#22d3ee" />
                        <stop offset="100%" stopColor="#2563eb" />
                    </linearGradient>
                    <linearGradient id="or-grad" x1="80" y1="0" x2="180" y2="80" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#fbbf24" />
                        <stop offset="100%" stopColor="#f97316" />
                    </linearGradient>
                    <linearGradient id="pk-grad" x1="80" y1="120" x2="180" y2="200" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#f472b6" />
                        <stop offset="100%" stopColor="#e11d48" />
                    </linearGradient>
                </defs>

                {/* Left vertical bar */}
                <rect x="18" y="12" width="60" height="176" rx="18" fill="url(#bl-grad)" />

                {/* Top right bump */}
                <circle cx="120" cy="62" r="52" fill="url(#or-grad)" />

                {/* Bottom right bump */}
                <circle cx="120" cy="142" r="52" fill="url(#pk-grad)" />

                {/* Top hole — uses background color to punch through */}
                <circle cx="90" cy="62" r="25" fill={bgColor} />

                {/* Bottom hole */}
                <circle cx="90" cy="142" r="25" fill={bgColor} />

                {/* Middle notch — makes the two bumps distinct */}
                <rect x="60" y="95" width="50" height="14" rx="4" fill={bgColor} />

                {/* Clock circle */}
                <circle cx="118" cy="58" r="22" fill="white" />
                {/* Clock inner ring */}
                <circle cx="118" cy="58" r="19" fill="white" stroke="#e2e8f0" strokeWidth="0.5" />
                {/* Hour hand */}
                <line x1="118" y1="58" x2="118" y2="44" stroke="#1e293b" strokeWidth="3" strokeLinecap="round" />
                {/* Minute hand */}
                <line x1="118" y1="58" x2="128" y2="52" stroke="#1e293b" strokeWidth="2.5" strokeLinecap="round" />
                {/* Center dot */}
                <circle cx="118" cy="58" r="2.5" fill="#1e293b" />
            </svg>

            {/* BuildTrack Text */}
            <div style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 3,
                fontSize,
                fontWeight: 800,
                letterSpacing: '-0.02em',
                lineHeight: 1,
                fontFamily: "'Inter', -apple-system, sans-serif"
            }}>
                <span style={{
                    background: 'linear-gradient(135deg, #22d3ee, #3b82f6)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                }}>
                    Build
                </span>
                <span style={{
                    background: 'linear-gradient(135deg, #f97316, #ec4899)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                }}>
                    Track
                </span>
            </div>
        </div>
    );
};

export default BuildTrackLogo;
