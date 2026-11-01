workspace {
    model {
        a = softwareSystem "A"
        partners = group "Partners" {
        }
    }
    views {
        systemLandscape "Landscape" {
            include a
            autoLayout tb 300 160
        }
        systemLandscape "Partners" {
            autoLayout tb 300 160
        }
    }
}
