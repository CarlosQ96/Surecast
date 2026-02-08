import type { DefaultTheme } from 'styled-components';
import { createGlobalStyle } from 'styled-components';

const breakpoints = ['600px', '768px', '992px'];

const theme = {
  fonts: {
    default:
      'Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
    code: 'ui-monospace,Menlo,Monaco,"Cascadia Mono","Segoe UI Mono","Roboto Mono","Oxygen Mono","Ubuntu Monospace","Source Code Pro","Fira Mono","Droid Sans Mono","Courier New", monospace',
  },
  fontSizes: {
    heading: '5.2rem',
    mobileHeading: '3.6rem',
    title: '2.4rem',
    large: '2rem',
    text: '1.6rem',
    small: '1.4rem',
  },
  radii: {
    default: '12px',
    button: '8px',
  },
  breakpoints,
  mediaQueries: {
    small: `@media screen and (max-width: ${breakpoints[0] as string})`,
    medium: `@media screen and (min-width: ${breakpoints[1] as string})`,
    large: `@media screen and (min-width: ${breakpoints[2] as string})`,
  },
  shadows: {
    default: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)',
    button: '0 1px 2px rgba(0, 0, 0, 0.05)',
  },
};

/**
 * Light theme — the only theme (LI.FI-inspired, Surecast pink).
 */
export const light: DefaultTheme = {
  colors: {
    background: {
      default: '#F9F9FB',
      alternative: '#FFFFFF',
      inverse: '#1A1A2E',
    },
    icon: {
      default: '#1F2937',
      alternative: '#9CA3AF',
    },
    text: {
      default: '#1F2937',
      muted: '#6B7280',
      alternative: '#4B5563',
      inverse: '#FFFFFF',
    },
    border: {
      default: '#E8E8EF',
    },
    primary: {
      default: '#D63384',
      inverse: '#FFFFFF',
    },
    card: {
      default: '#FFFFFF',
    },
    error: {
      default: '#EF4444',
      alternative: '#DC2626',
      muted: '#FEF2F2',
    },
  },
  ...theme,
};

/**
 * Dark theme alias — kept for compatibility, points to light.
 */
export const dark: DefaultTheme = light;

export const GlobalStyle = createGlobalStyle`
  html {
    font-size: 62.5%;
  }

  body {
    background-color: ${(props) => props.theme.colors.background?.default};
    color: ${(props) => props.theme.colors.text?.default};
    font-family: ${(props) => props.theme.fonts.default};
    font-size: ${(props) => props.theme.fontSizes.text};
    margin: 0;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  h1, h2, h3, h4, h5, h6 {
    font-size: ${(props) => props.theme.fontSizes.heading};
    ${(props) => props.theme.mediaQueries.small} {
      font-size: ${(props) => props.theme.fontSizes.mobileHeading};
    }
  }

  code {
    background-color: ${(props) => props.theme.colors.background?.alternative};
    font-family: ${(props) => props.theme.fonts.code};
    padding: 1.2rem;
    font-weight: normal;
    font-size: ${(props) => props.theme.fontSizes.text};
  }

  button {
    font-size: ${(props) => props.theme.fontSizes.small};
    border-radius: ${(props) => props.theme.radii.button};
    background-color: #D63384;
    color: #FFFFFF;
    border: 1px solid #D63384;
    font-weight: bold;
    padding: 1rem;
    min-height: 4.2rem;
    cursor: pointer;
    transition: all .2s ease-in-out;

    &:hover {
      background-color: #E24A9E;
      border-color: #E24A9E;
      color: #FFFFFF;
    }

    &:disabled,
    &[disabled] {
      background-color: #E8E8EF;
      border-color: #E8E8EF;
      color: #9CA3AF;
      cursor: not-allowed;
    }

    &:disabled:hover,
    &[disabled]:hover {
      background-color: #E8E8EF;
      border-color: #E8E8EF;
      color: #9CA3AF;
    }
  }
`;
