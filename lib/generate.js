const chalk = require('chalk')
const Metalsmith = require('metalsmith')
const Handlebars = require('handlebars')
const async = require('async')
const render = require('consolidate').handlebars.render
const path = require('path')
const multimatch = require('multimatch')
const getOptions = require('./options')
const ask = require('./ask')
const filter = require('./filter')
const logger = require('./logger')

// register handlebars helper
Handlebars.registerHelper('if_eq', function (a, b, opts) {
  return a === b
    ? opts.fn(this)
    : opts.inverse(this)
})

Handlebars.registerHelper('unless_eq', function (a, b, opts) {
  return a === b
    ? opts.inverse(this)
    : opts.fn(this)
})

/**
 * Generate a template given a `src` and `dest`.
 *
 * @param {String} name: 项目文件夹名
 * @param {String} src: 项目模板路径
 * @param {String} dest: 创建项目的路径
 * @param {Function} done:
 */

module.exports = function generate (name, src, dest, done) {
  const opts = getOptions(name, src) // 获取创建项目时的一些提示选项，如是否开启ESLint
  const metalsmith = Metalsmith(path.join(src, 'template'))
  // 将自定义的meta值与metalsmith的meta值合并
  console.log('assign before data: ', metalsmith.metadata())
  const data = Object.assign(metalsmith.metadata(), {
    destDirName: name,
    inPlace: dest === process.cwd(),
    noEscape: true
  })
  console.log('assign after data: ', metalsmith.metadata())
  // 注册handlebars的helper，主要根据筛选条件来对项目模板中的文件及功能进行删减
  opts.helpers && Object.keys(opts.helpers).map(key => {
    Handlebars.registerHelper(key, opts.helpers[key])
  })

  const helpers = { chalk, logger }

  if (opts.metalsmith && typeof opts.metalsmith.before === 'function') {
    // 在before这个函数里面设置了vue-cli对话场景中的回答
    opts.metalsmith.before(metalsmith, opts, helpers)
  }

  // askQuestions: 提供项目配置选项供用户选择，并收集用户设置的选项
  metalsmith.use(askQuestions(opts.prompts))
  // 根据用户设置的配置信息，删除项目模板中的文件
    .use(filterFiles(opts.filters))
    .use(renderTemplateFiles(opts.skipInterpolation))

  if (typeof opts.metalsmith === 'function') {
    opts.metalsmith(metalsmith, opts, helpers)
  } else if (opts.metalsmith && typeof opts.metalsmith.after === 'function') {
    opts.metalsmith.after(metalsmith, opts, helpers)
  }

  metalsmith.clean(false)
    .source('.') // start from template root instead of `./src` which is Metalsmith's default for `source`
    .destination(dest)
    .build((err, files) => {
      done(err)
      if (typeof opts.complete === 'function') {
        const helpers = { chalk, logger, files }
        console.log('metalsmith build data: ', data)
        opts.complete(data, helpers)
      } else {
        logMessage(opts.completeMessage, data)
      }
    })

  return data
}

/**
 * Create a middleware for asking questions.
 *
 * @param {Object} prompts
 * @return {Function}
 */

function askQuestions (prompts) {
  return (files, metalsmith, done) => {
    // 最终用户设置的选项都会放到metalsmith.metadata()中
    console.log('askQuestions before: ', metalsmith.metadata())
    ask(prompts, metalsmith.metadata(), () => {
      console.log('askQuestions after: ', metalsmith.metadata())
      done()
    })
  }
}

/**
 * Create a middleware for filtering files.
 *
 * @param {Object} filters
 * @return {Function}
 */

function filterFiles (filters) {
  // files是metalsmith待处理的文件，也就是metalsmith.source()设置的路径下的文件
  // 其格式是一个以文件名为key的对象, 这个files包含的是metalsmith.source()设置的路径下的所有文件
  // 然后通过filters来筛选需要进行处理的文件，因为有些文件是标配的，不需要增删，我们只需要通过
  // filters来对我们要处理的文件进行处理
  return (files, metalsmith, done) => {
    filter(files, filters, metalsmith.metadata(), done)
  }
}

/**
 * Template in place plugin.
 *
 * @param {Object} files
 * @param {Metalsmith} metalsmith
 * @param {Function} done
 */

function renderTemplateFiles (skipInterpolation) {
  skipInterpolation = typeof skipInterpolation === 'string'
    ? [skipInterpolation]
    : skipInterpolation
  return (files, metalsmith, done) => {
    const keys = Object.keys(files)
    const metalsmithMetadata = metalsmith.metadata()
    async.each(keys, (file, next) => {
      // skipping files with skipInterpolation option
      if (skipInterpolation && multimatch([file], skipInterpolation, { dot: true }).length) {
        return next()
      }
      const str = files[file].contents.toString()
      // do not attempt to render files that do not have mustaches
      if (!/{{([^{}]+)}}/g.test(str)) {
        return next()
      }
      render(str, metalsmithMetadata, (err, res) => {
        if (err) {
          err.message = `[${file}] ${err.message}`
          return next(err)
        }
        files[file].contents = new Buffer(res)
        next()
      })
    }, done)
  }
}

/**
 * Display template complete message.
 *
 * @param {String} message
 * @param {Object} data
 */

function logMessage (message, data) {
  if (!message) return
  render(message, data, (err, res) => {
    if (err) {
      console.error('\n   Error when rendering template complete message: ' + err.message.trim())
    } else {
      console.log('\n' + res.split(/\r?\n/g).map(line => '   ' + line).join('\n'))
    }
  })
}
