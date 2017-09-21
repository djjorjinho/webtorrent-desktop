module.exports = {
    showRssMenu,
    startRssManager
}

const Watcher = require('rss-watcher')
const rssWatchers = []
const rssItems = {}
const remote = require('electron').remote
const Menu = remote.Menu
const MenuItem = remote.MenuItem


function startRssManager(state) {
    state.saved.rssFeeds = [
        'https://showrss.info/user/27527.rss?magnets=true&namespaces=true&name=clean&quality=null&re=null',
    ]
    if (rssWatchers.length == 0) {
        state.saved.rssFeeds.forEach(function (feed) {
            var watcher = new Watcher(feed)
            watcher.set({interval: 1 * 60})
            watcher.run(function(err, articles) {
                if (articles)
                    articles.reverse().forEach((x) => rssItems[x.title] = x)
            })
            watcher.on('new article', function(article) {
                console.log(article)
                rssItems[article.title] = article
            })
            rssWatchers.push(watcher)
        })
    }
}

function showRssMenu() {
    var menu = new Menu()
    var reduced = Object.keys(rssItems).reduceRight(function(prev, key) {
        var curr = rssItems[key]
        var key = curr.pubDate.toISOString().split("T",1)[0] + ";"+ curr.pubDate.toString().split(" ", 4).join(" ")
        var list = prev[key] || []
        list.push(curr)
        prev[key] = list
        return prev
    }, {})

    Object.keys(reduced).sort().reverse().forEach(function (key) {
        var articles = reduced[key]
        menu.append(new MenuItem({ label: key.split(";")[1], click: function() { }}))
        articles.forEach(function (article) {
            menu.append(new MenuItem({ label: "\t" + article.title, click: function() {
                var link = article.link
                if (article['torrent:magneturi']) {
                    link = article['torrent:magneturi']['#']
                }
                dispatch('addTorrent', link)
            }}))
        })
    })
    menu.popup(remote.getCurrentWindow())
}
