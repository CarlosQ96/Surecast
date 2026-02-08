import styled from 'styled-components';

const FooterWrapper = styled.footer`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  padding-top: 2.4rem;
  padding-bottom: 2.4rem;
  border-top: 1px solid ${(props) => props.theme.colors.border?.default};
`;

const FooterText = styled.p`
  font-size: ${(props) => props.theme.fontSizes.small};
  color: ${(props) => props.theme.colors.text?.muted};
  margin: 0;
`;

const FooterLink = styled.a`
  color: #D63384;
  text-decoration: none;
  font-weight: 600;

  &:hover {
    text-decoration: underline;
  }
`;

export const Footer = () => {
  return (
    <FooterWrapper>
      <FooterText>
        Surecast — Built with{' '}
        <FooterLink href="https://li.fi" target="_blank" rel="noopener noreferrer">
          LI.FI
        </FooterLink>
        {' + '}
        <FooterLink href="https://ens.domains" target="_blank" rel="noopener noreferrer">
          ENS
        </FooterLink>
        {' | HackMoney 2025'}
      </FooterText>
    </FooterWrapper>
  );
};
