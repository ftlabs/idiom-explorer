const debug = require('debug')('bin:lib:check-token');
const S3O = require('@financial-times/s3o-middleware');
const S3OAPI = require('@financial-times/s3o-middleware').authS3ONoRedirect;

module.exports = (req, res, next) => {
	const passedToken = req.headers.token;
	const allowedIps =
		'ALLOWED_IPS' in process.env
			? process.env.ALLOWED_IPS.split(',')
			: ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
	const clientIp =
		req.headers['x-forwarded-for'] || req.connection.remoteAddress;
	console.log(allowedIps);
	console.log(clientIp);
	debug(`Authenticating user...`);

	if (allowedIps.indexOf(clientIp) !== -1) {
		debug(`Allowing bypass via IP`);
		next();
	} else if (passedToken === undefined) {
		debug(`No token has been passed to service. Falling through to S3O`);
		if (req.originalUrl.includes('api')) {
			S3OAPI(req, res, next);
		} else {
			S3O(req, res, next);
		}
	} else if (passedToken === process.env.TOKEN) {
		debug(`Token was valid`);
		next();
	} else {
		res.status(401);
		res.json({
			status: 'err',
			message: 'The token value passed was invalid.'
		});
	}
};
