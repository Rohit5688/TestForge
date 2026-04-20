const { Project } = require('ts-morph');
const fs = require('fs');

const project = new Project();
const sourceFile = project.addSourceFileAtPath('C:/Users/Rohit/mcp/TestForge/src/services/CodebaseAnalyzerService.ts');
const classDecl = sourceFile.getClass('CodebaseAnalyzerService');

const methodsToRemove = [
    'resolveAndExtractWrapperMethods',
    'saveWrapperCacheToFile',
    'loadWrapperCacheFromFile',
    'introspectWrapper',
    'extractPublicMethods',
    'hasClassLocatorsFast',
    'extractSteps',
    'getWrapperVersion',
    'resolvePackageRoot',
    'scanWrapper',
    'scanWrapperDir',
    'scanForDuplicatePlaywrightInstallations'
];

for (const methodName of methodsToRemove) {
    const method = classDecl.getMethod(methodName);
    if (method) {
        console.log('Removing method:', methodName);
        method.remove();
    }
}

sourceFile.saveSync();
console.log('Done removing methods.');
