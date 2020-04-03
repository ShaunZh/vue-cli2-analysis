const match = require('minimatch')
const evaluate = require('./eval')

// data: 是metalsmith.metadata()值
module.exports = (files, filters, data, done) => {
  if (!filters) {
    return done()
  }

  // files: 是以文件名为key的对象
  const fileNames = Object.keys(files)
  console.log('fileNames: ', fileNames)
  console.log('fileters: ', filters)
  Object.keys(filters).forEach(glob => {
    fileNames.forEach(file => {
      // dot: true ——表示允许文件名以一个" . " 开始
      // 比较要过滤文件名是否与file文件名相同，这里只是处理filters中标记的文件，
      if (match(file, glob, { dot: true })) {
        const condition = filters[glob]
        // 通过data（用户配置的项目信息）与当前文件在过滤条件中的配置字段，来判断是否应该删除项目模板中的当前文件(只是删除files配置中的当前文件，然后通过metalsmith来删除文件)
        if (!evaluate(condition, data)) {
          delete files[file]
        }
      }
    })
  })
  done()
}
