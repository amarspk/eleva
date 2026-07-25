const React = require('react');
const Image = (props) => React.createElement('img', { src: props.src, alt: props.alt, ...props });
module.exports = Image;
