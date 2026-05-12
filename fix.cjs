const fs = require('fs');

function fixFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    // Replace literal backslash followed by backtick
    let newContent = content.replace(/\\`/g, '`');
    // Replace literal backslash followed by dollar sign
    newContent = newContent.replace(/\\\$/g, '$');
    
    if (content !== newContent) {
        fs.writeFileSync(filePath, newContent);
        console.log('Fixed', filePath);
    } else {
        console.log('No changes in', filePath);
    }
}

['purchases.js', 'products.js', 'reports.js', 'clients.js'].forEach(f => {
    fixFile('c:/inventario/client/js/modules/' + f);
});
