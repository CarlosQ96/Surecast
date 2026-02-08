import styled from 'styled-components';

import { HeaderButtons } from './Buttons';
import surecastLogo from '../assets/surecast_logo.png';

const HeaderWrapper = styled.header`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 2.4rem;
  border-bottom: 1px solid ${(props) => props.theme.colors.border?.default};
  background-color: #FFFFFF;
`;

const Title = styled.p`
  font-size: ${(props) => props.theme.fontSizes.title};
  font-weight: bold;
  margin: 0;
  margin-left: 1.2rem;
  color: ${(props) => props.theme.colors.text?.default};
  ${({ theme }) => theme.mediaQueries.small} {
    display: none;
  }
`;

const LogoWrapper = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
`;

const LogoImage = styled.img`
  height: 40px;
  width: auto;
`;

export const Header = () => {
  return (
    <HeaderWrapper>
      <LogoWrapper>
        <LogoImage src={surecastLogo} alt="Surecast" />
        <Title>Surecast</Title>
      </LogoWrapper>
      <HeaderButtons />
    </HeaderWrapper>
  );
};
